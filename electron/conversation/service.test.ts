import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  ConversationEvent,
  ConversationHistoryPage,
  HostToolDefinition,
  RuntimeCapability,
} from '../../src/features/conversation/contracts'
import type { ChannelSourceInput } from '../../src/types/channelCollaboration'
import {
  ConversationCatalog,
  ConversationCatalogError,
  type ConversationCatalogRecord,
} from './catalog'
import {
  ConversationRuntimeError,
  type ConversationRuntime,
  type RuntimeConversationBinding,
  type RuntimeConversationCommand,
} from './runtime'
import { ConversationRuntimeRegistry } from './runtimeRegistry'
import {
  RuntimeConversationService,
  type RuntimeConversationCatalogPort,
  type RuntimeHostToolResolver,
} from './service'

const HOST_TOOL: HostToolDefinition = {
  name: 'tea.channel.history',
  version: '1',
  description: 'Load selected Channel history',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
}

describe('RuntimeConversationService', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('reports create success only after catalog persistence and reuses an active idempotent result', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime()
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()

    const request = createRequest()
    const created = await service.createConversation(request)
    const duplicate = await service.createConversation(request)

    expect(duplicate).toEqual(created)
    expect(runtime.configureHostTools).toHaveBeenCalledOnce()
    expect(runtime.configureHostTools).toHaveBeenCalledWith('conversation-1', [HOST_TOOL])
    expect(runtime.createConversation).toHaveBeenCalledOnce()
    expect(catalog.get('conversation-1')).toMatchObject({
      summary: {
        conversationId: 'conversation-1',
        runtimeId: 'external.test',
        workspaceId: 'workspace-1',
      },
      nativeSessionId: 'session:conversation-1',
      idempotencyKey: 'create:one',
      binding: { hostTools: [{ name: HOST_TOOL.name, version: HOST_TOOL.version }] },
    })
    await service.shutdown()
  })

  it('relays ordered runtime events and catalog updates without exposing another fact store', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime()
    const conversationEvents: ConversationEvent[] = []
    const updatedIds: string[] = []
    const service = new RuntimeConversationService(
      catalog,
      new ConversationRuntimeRegistry([runtime.value]),
      resolver(),
      () => 'conversation-1',
      () => 500,
      undefined,
      {
        conversationEvent: (event) => conversationEvents.push(event),
        conversationUpdated: (summary) => updatedIds.push(summary.conversationId),
      },
    )
    await service.initialize()
    await service.createConversation(createRequest())

    runtime.emit({
      conversationId: 'conversation-1',
      sequence: 1,
      event: { type: 'runStarted' },
    })

    expect(conversationEvents).toEqual([
      { conversationId: 'conversation-1', sequence: 1, event: { type: 'runStarted' } },
    ])
    expect(updatedIds).toEqual(['conversation-1'])
    await service.remove('conversation-1')
    runtime.emit({
      conversationId: 'conversation-1',
      sequence: 2,
      event: { type: 'runFinished' },
    })
    expect(conversationEvents).toHaveLength(1)
    await service.shutdown()
  })

  it('deduplicates concurrent identical creates and rejects a changed request using the same key', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const gate = deferred<void>()
    const runtime = fakeRuntime({ createGate: gate.promise })
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()

    const first = service.createConversation(createRequest())
    const duplicate = service.createConversation(createRequest())
    await expect(
      service.createConversation({ ...createRequest(), workspaceId: 'workspace-2' }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    gate.resolve(undefined)

    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2)
    expect(runtime.createConversation).toHaveBeenCalledOnce()
    await service.shutdown()
  })

  it('closes only the newly created runtime conversation when the local write fails', async () => {
    const catalog = failingCreateCatalog()
    const runtime = fakeRuntime()
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()

    await expect(service.createConversation(createRequest())).rejects.toMatchObject({
      code: 'storageFailure',
    })
    expect(runtime.closeConversation).toHaveBeenCalledOnce()
    expect(runtime.shutdown).not.toHaveBeenCalled()
    await service.shutdown().catch(() => undefined)
  })

  it('rejects an unknown creation-time HostTool before configuring the runtime', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime()
    const hostTools: RuntimeHostToolResolver = {
      resolve: vi.fn(async () => {
        throw new ConversationRuntimeError('notConfigured', 'unknown HostTool')
      }),
    }
    const service = createService(catalog, runtime.value, hostTools, () => 'conversation-1')
    await service.initialize()

    await expect(service.createConversation(createRequest())).rejects.toMatchObject({
      code: 'notConfigured',
    })
    expect(runtime.configureHostTools).not.toHaveBeenCalled()
    expect(runtime.createConversation).not.toHaveBeenCalled()
    await service.shutdown()
  })

  it('cold-restores the exact binding after resolving its HostTool references', async () => {
    const filePath = await catalogPath()
    const firstCatalog = new ConversationCatalog(filePath)
    const firstRuntime = fakeRuntime()
    const first = createService(
      firstCatalog,
      firstRuntime.value,
      resolver(),
      () => 'conversation-1',
    )
    await first.initialize()
    const created = await first.createConversation(createRequest())
    await first.shutdown()

    const secondCatalog = new ConversationCatalog(filePath)
    const secondRuntime = fakeRuntime()
    const hostTools = resolver()
    const second = createService(secondCatalog, secondRuntime.value, hostTools)
    await second.initialize()

    await expect(second.restoreConversation('conversation-1')).resolves.toEqual(created.handle)
    expect(hostTools.resolve).toHaveBeenCalledWith([
      { name: HOST_TOOL.name, version: HOST_TOOL.version },
    ])
    expect(secondRuntime.configureHostTools).toHaveBeenCalledWith('conversation-1', [HOST_TOOL])
    expect(secondRuntime.restoreConversation).toHaveBeenCalledWith(
      'conversation-1',
      created.handle.binding,
    )
    await second.shutdown()
  })

  it('records a bounded failure and removes configured runtime state when restore fails', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(catalogRecord())
    const runtime = fakeRuntime({
      restoreFailure: new ConversationRuntimeError(
        'connectionFailed',
        'unbounded diagnostics must not be persisted',
        true,
      ),
    })
    const service = createService(catalog, runtime.value, resolver(), undefined, () => 900)

    await expect(service.restoreConversation('conversation-1')).rejects.toMatchObject({
      code: 'connectionFailed',
      retryable: true,
    })
    expect(runtime.closeConversation).toHaveBeenCalledWith('conversation-1')
    expect(catalog.get('conversation-1')?.lastRestoreFailure).toEqual({
      code: 'connectionFailed',
      failedAt: 900,
    })
    await service.shutdown()
  })

  it('rejects changed HostTool resolution before runtime restore', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(catalogRecord())
    const runtime = fakeRuntime()
    const changedResolver: RuntimeHostToolResolver = {
      resolve: vi.fn(async () => [{ ...HOST_TOOL, version: '2' }]),
    }
    const service = createService(catalog, runtime.value, changedResolver)

    await expect(service.restoreConversation('conversation-1')).rejects.toMatchObject({
      code: 'invalidConfiguration',
    })
    expect(runtime.configureHostTools).not.toHaveBeenCalled()
    expect(runtime.restoreConversation).not.toHaveBeenCalled()
    expect(runtime.closeConversation).toHaveBeenCalledWith('conversation-1')
    await service.shutdown()
  })

  it('keeps an unavailable runtime out of application-service creation', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime({ status: 'unavailable' })
    const service = createService(catalog, runtime.value, resolver())
    await service.initialize()

    await expect(service.createConversation(createRequest())).rejects.toMatchObject({
      code: 'runtimeUnavailable',
      retryable: true,
    })
    expect(runtime.configureHostTools).not.toHaveBeenCalled()
    await service.shutdown()
  })

  it('records runtime unavailability as a cold-restore failure', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(catalogRecord())
    const runtime = fakeRuntime({ status: 'unavailable' })
    const service = createService(catalog, runtime.value, resolver(), undefined, () => 901)

    await expect(service.restoreConversation('conversation-1')).rejects.toMatchObject({
      code: 'runtimeUnavailable',
    })
    expect(catalog.get('conversation-1')?.lastRestoreFailure).toEqual({
      code: 'runtimeUnavailable',
      failedAt: 901,
    })
    await service.shutdown()
  })

  it('persists explicit Channel evidence before sending only the JSON-wrapped runtime prompt', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime()
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()
    await service.createConversation(channelCreateRequest())

    await service.sendMessage('conversation-1', 'Summarize this decision', {
      model: 'default',
      permissionMode: 'default',
      sources: [channelSource('message-1', 'Approved for Friday')],
    })

    const context = catalog.collaborationSnapshot('conversation-1').turnContexts[0]
    expect(context).toMatchObject({
      turnIndex: 0,
      visibleText: 'Summarize this decision',
      sources: [{ text: 'Approved for Friday', origin: 'userForwarded' }],
    })
    const command = runtime.sendMessage.mock.calls[0]?.[0]
    expect(command?.options).toEqual({ model: 'default', permissionMode: 'default' })
    expect(command?.text).toContain('untrusted Channel evidence')
    expect(command?.text).toContain('Approved for Friday')
    expect(catalog.get('conversation-1')?.summary).toMatchObject({
      title: 'Summarize this decision',
      lastMessagePreview: 'Summarize this decision',
    })
    await service.shutdown()
  })

  it('removes only the new Channel context when runtime prompt dispatch is rejected', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime({
      sendFailure: new ConversationRuntimeError('invalidState', 'turn already active'),
    })
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()
    await service.createConversation(channelCreateRequest())

    await expect(
      service.sendMessage('conversation-1', 'Second turn', {
        model: 'default',
        permissionMode: 'default',
        sources: [],
      }),
    ).rejects.toMatchObject({ code: 'invalidState' })

    expect(catalog.collaborationSnapshot('conversation-1').turnContexts).toEqual([])
    await service.shutdown()
  })

  it('continues Channel turn indices after cold resume without loading a snapshot', async () => {
    const filePath = await catalogPath()
    const firstCatalog = new ConversationCatalog(filePath)
    const firstRuntime = fakeRuntime()
    const first = createService(
      firstCatalog,
      firstRuntime.value,
      resolver(),
      () => 'conversation-1',
    )
    await first.initialize()
    await first.createConversation(channelCreateRequest())
    await first.sendMessage('conversation-1', 'First', {
      model: 'default',
      permissionMode: 'default',
      sources: [],
    })
    await first.shutdown()

    const secondCatalog = new ConversationCatalog(filePath)
    const secondRuntime = fakeRuntime()
    const second = createService(secondCatalog, secondRuntime.value, resolver())
    await second.initialize()
    await second.sendMessage('conversation-1', 'Second', {
      model: 'default',
      permissionMode: 'default',
      sources: [],
    })

    expect(secondRuntime.restoreConversation).toHaveBeenCalledOnce()
    expect(secondRuntime.loadSnapshot).not.toHaveBeenCalled()
    expect(
      secondCatalog
        .collaborationSnapshot('conversation-1')
        .turnContexts.map((context) => [context.turnIndex, context.visibleText]),
    ).toEqual([
      [0, 'First'],
      [1, 'Second'],
    ])
    await second.shutdown()
  })

  it('projects catalog-owned visible text over the wrapped ACP history prompt', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const runtime = fakeRuntime({ historyPage: historyPage('wrapped ACP prompt') })
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()
    await service.createConversation(channelCreateRequest())
    await service.sendMessage('conversation-1', 'Visible request', {
      model: 'default',
      permissionMode: 'default',
      sources: [],
    })

    const page = await service.loadConversationHistory({
      conversationId: 'conversation-1',
      limit: 20,
    })

    expect(page.items[0]?.user.text).toBe('Visible request')
    await service.shutdown()
  })

  it('coalesces background subjects and never overwrites a manual title', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    const subject = deferred<string>()
    const runtime = fakeRuntime({ capabilities: ['subject'], subjectPromise: subject.promise })
    const service = createService(catalog, runtime.value, resolver(), () => 'conversation-1')
    await service.initialize()
    await service.createConversation(createRequest())

    await service.sendMessage('conversation-1', 'First prompt', {
      model: 'default',
      permissionMode: 'default',
    })
    await service.sendMessage('conversation-1', 'Second prompt', {
      model: 'default',
      permissionMode: 'default',
    })
    catalog.setTitleIfMissing('conversation-1', 'Manual title')
    subject.resolve('Generated title')
    await vi.waitFor(() => expect(runtime.generateSubject).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(catalog.get('conversation-1')?.summary.title).toBe('Manual title'),
    )

    await service.shutdown()
  })

  async function catalogPath(): Promise<string> {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runtime-service-'))
    temporaryDirectories.push(directory)
    return path.join(directory, 'conversation-catalog.sqlite3')
  }
})

function createService(
  catalog: RuntimeConversationCatalogPort,
  runtime: ConversationRuntime,
  hostTools: RuntimeHostToolResolver,
  createId?: () => string,
  now: () => number = () => 500,
): RuntimeConversationService {
  return new RuntimeConversationService(
    catalog,
    new ConversationRuntimeRegistry([runtime]),
    hostTools,
    createId,
    now,
  )
}

function createRequest() {
  return {
    runtimeId: 'external.test',
    workspaceId: 'workspace-1',
    idempotencyKey: 'create:one',
    hostTools: [{ name: HOST_TOOL.name, version: HOST_TOOL.version }],
  }
}

function channelCreateRequest() {
  return {
    ...createRequest(),
    channelBinding: {
      transportId: 'yunxin',
      accountRef: 'account-1',
      channelRef: 'channel-1',
    },
  }
}

function resolver(): RuntimeHostToolResolver & { resolve: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn(async () => [structuredClone(HOST_TOOL)]),
  }
}

function fakeRuntime(
  options: {
    createGate?: Promise<void>
    restoreFailure?: unknown
    status?: 'ready' | 'unavailable'
    capabilities?: RuntimeCapability[]
    sendFailure?: unknown
    subjectPromise?: Promise<string>
    historyPage?: ConversationHistoryPage
  } = {},
) {
  const configured = new Map<string, HostToolDefinition[]>()
  const listeners = new Map<string, (event: ConversationEvent) => void>()
  const configureHostTools = vi.fn(
    async (conversationId: string, definitions: HostToolDefinition[]) => {
      configured.set(conversationId, structuredClone(definitions))
    },
  )
  const createConversation = vi.fn(async (conversationId: string) => {
    await options.createGate
    return runtimeHandle(conversationId, configured.get(conversationId) ?? [])
  })
  const restoreConversation = vi.fn(
    async (conversationId: string, binding: RuntimeConversationBinding) => {
      if (options.restoreFailure) throw options.restoreFailure
      return {
        conversationId,
        runtimeId: binding.runtimeId,
        nativeSessionId: binding.nativeSessionId,
        binding: structuredClone(binding),
      }
    },
  )
  const closeConversation = vi.fn(async (conversationId: string) => {
    configured.delete(conversationId)
  })
  const shutdown = vi.fn(async () => undefined)
  const loadSnapshot = vi.fn()
  const generateSubject = vi.fn(async () => options.subjectPromise ?? 'Generated subject')
  const sendMessage = vi.fn(async (_command: RuntimeConversationCommand) => {
    if (options.sendFailure) throw options.sendFailure
  })
  const value = {
    descriptor: () => ({
      id: 'external.test',
      kind: 'externalCli' as const,
      displayName: 'Test Agent',
      capabilities: options.capabilities ?? [],
      status: options.status ?? ('ready' as const),
    }),
    createConversation,
    restoreConversation,
    closeConversation,
    configureHostTools,
    loadSnapshot,
    loadHistory: vi.fn(async () => structuredClone(options.historyPage ?? historyPage('Prompt'))),
    generateSubject,
    sendMessage,
    cancel: vi.fn(),
    resolveApproval: vi.fn(),
    subscribe: vi.fn((conversationId: string, listener: (event: ConversationEvent) => void) => {
      listeners.set(conversationId, listener)
      return () => listeners.delete(conversationId)
    }),
    shutdown,
  } satisfies ConversationRuntime
  return {
    value,
    configureHostTools,
    createConversation,
    restoreConversation,
    closeConversation,
    loadSnapshot,
    generateSubject,
    sendMessage,
    emit: (event: ConversationEvent) => listeners.get(event.conversationId)?.(event),
    shutdown,
  }
}

function runtimeHandle(conversationId: string, hostTools: HostToolDefinition[]) {
  const nativeSessionId = `session:${conversationId}`
  const binding: RuntimeConversationBinding = {
    schemaVersion: 1,
    runtimeId: 'external.test',
    nativeSessionId,
    implementation: { kind: 'acp', id: 'agent.test', revision: 1 },
    protocol: { name: 'acp', version: 2 },
    artifact: {
      packageName: '@agentclientprotocol/test-agent',
      version: '1.0.0',
      integrity: 'sha512-synthetic',
    },
    workspacePath: '/workspace',
    hostTools: hostTools.map(({ name, version }) => ({ name, version })),
  }
  return {
    conversationId,
    runtimeId: 'external.test',
    nativeSessionId,
    binding,
  }
}

function catalogRecord(): ConversationCatalogRecord {
  const handle = runtimeHandle('conversation-1', [HOST_TOOL])
  return {
    summary: {
      conversationId: 'conversation-1',
      runtimeId: 'external.test',
      workspaceId: 'workspace-1',
      createdAt: 100,
      updatedAt: 100,
    },
    nativeSessionId: handle.nativeSessionId,
    idempotencyKey: 'create:one',
    binding: handle.binding,
  }
}

function failingCreateCatalog(): RuntimeConversationCatalogPort {
  return {
    initialize: vi.fn(async () => undefined),
    create: vi.fn(() => {
      throw new ConversationCatalogError('storageFailure', 'disk full', true)
    }),
    get: vi.fn(() => null),
    findByIdempotencyKey: vi.fn(() => null),
    list: vi.fn(() => ({ items: [], nextCursor: null, hasMore: false })),
    createTurnContext: vi.fn(),
    appendTurnSources: vi.fn(),
    removeTurnContext: vi.fn(),
    collaborationSnapshot: vi.fn(() => ({ turnContexts: [], drafts: [], deliveries: [] })),
    updateActivity: vi.fn(),
    setTitleIfMissing: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    prepareDelivery: vi.fn(),
    updateDelivery: vi.fn(),
    rename: vi.fn(),
    archive: vi.fn(),
    remove: vi.fn(),
    recordRestoreFailure: vi.fn(),
    clearRestoreFailure: vi.fn(),
    close: vi.fn(),
  }
}

function channelSource(messageClientId: string, text: string): ChannelSourceInput {
  return {
    messageRef: {
      channelRef: 'channel-1',
      messageClientId,
      messageServerId: `server-${messageClientId}`,
    },
    senderName: 'Lin',
    sentAt: 10,
    sentByCurrentUser: false,
    text,
    capturedAt: 20,
    state: 'active',
  }
}

function historyPage(text: string): ConversationHistoryPage {
  return {
    items: [
      {
        id: 'turn-1',
        user: { id: 'prompt-1', text, attachments: [] },
        blocks: [],
        status: 'completed',
        lastEventSequence: 1,
      },
    ],
    nextCursor: null,
    hasMore: false,
    startIndex: 0,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
