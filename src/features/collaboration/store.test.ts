import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChannelTransportError,
  type ChannelCapability,
  type SendMessageRequest,
  type SendMessageResult,
} from '@/features/channels/contracts'
import type {
  ConversationDetail,
  RuntimeDescriptor,
  SendMessageOptions,
} from '@/features/conversation/contracts'
import { MockChannelTransport } from '@/infrastructure/channels/MockChannelTransport'
import { FakeConversationClient } from '@/infrastructure/conversation/electronConversationClient'
import { useAgentDrawerStore } from './agentDrawerStore'
import { useCollaborationStore } from './store'

const runtime: RuntimeDescriptor = {
  id: 'external.codex',
  kind: 'externalCli',
  displayName: 'Codex',
  capabilities: ['prompt', 'events', 'snapshot', 'hostTools'],
  status: 'ready',
}

class RecordingConversationClient extends FakeConversationClient {
  sends: Array<{ conversationId: string; text: string; options: SendMessageOptions }> = []

  override async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    this.sends.push({ conversationId, text, options: structuredClone(options) })
    await super.sendMessage(conversationId, text, options)
  }
}

class DeferredListConversationClient extends RecordingConversationClient {
  private readonly listGate: Promise<void>
  private releaseListGate!: () => void

  constructor() {
    super()
    this.listGate = new Promise((resolve) => {
      this.releaseListGate = resolve
    })
  }

  override async listConversations(
    ...args: Parameters<FakeConversationClient['listConversations']>
  ) {
    await this.listGate
    return super.listConversations(...args)
  }

  releaseList(): void {
    this.releaseListGate()
  }
}

class NoSendTransport extends MockChannelTransport {
  override capabilities(): ChannelCapability[] {
    return super
      .capabilities()
      .map((capability) =>
        capability.id === 'message.send.text'
          ? { ...capability, available: false, reason: 'unsupported' }
          : capability,
      )
  }
}

class FailBeforeSendTransport extends MockChannelTransport {
  attempts = 0

  override async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    this.attempts += 1
    if (this.attempts === 1) throw new ChannelTransportError('transport', true)
    return super.sendMessage(request)
  }
}

class LoseAcknowledgementTransport extends MockChannelTransport {
  attempts = 0

  override async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    this.attempts += 1
    const result = await super.sendMessage(request)
    if (this.attempts === 1) throw new ChannelTransportError('transport', true)
    return result
  }
}

class StructuredErrorConversationClient extends RecordingConversationClient {
  override async createConversation(): Promise<never> {
    throw { code: 'restoreFailed', message: 'start codex thread: protocol failed', retryable: true }
  }
}

async function setup(transport: MockChannelTransport = new MockChannelTransport()) {
  await transport.connect()
  const client = new RecordingConversationClient()
  client.setRuntimes([runtime])
  const store = useCollaborationStore()
  store.configure(client, transport)
  await store.loadRuntimes()
  await store.bindChannel('product-collab')
  return { store, client, transport }
}

describe('useCollaborationStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('initializes untouched Channel drafts with the selected ready Runtime', async () => {
    const { store } = await setup()
    const drawer = useAgentDrawerStore()

    expect(drawer.activeState?.draft.runtimeId).toBe('external.codex')
    expect(drawer.activeState?.draft.permissionMode).toBe('default')

    drawer.updateDraft(store.activeBinding!, { runtimeId: 'external.explicit' })
    await store.bindChannel('another-channel')
    await store.bindChannel('product-collab')

    expect(drawer.activeState?.draft.runtimeId).toBe('external.explicit')
  })

  it('stages and deduplicates sources without starting an Agent run', async () => {
    const { store, client, transport } = await setup()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 2,
    })
    store.stageMessage(page.items[0]!)
    store.stageMessage(page.items[0]!)

    expect(store.stagedSources).toHaveLength(1)
    expect(store.chooserOpen).toBe(true)
    expect(client.sends).toEqual([])
  })

  it('creates the selected runtime conversation only when the first prompt is sent', async () => {
    const { store, client } = await setup()
    const create = vi.spyOn(client, 'createConversation')
    store.selectRuntime('external.codex')

    await store.sendMessage('Start only now')

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[1].hostTools).toMatchObject([
      { name: 'load_channel_messages', version: '1.0.0' },
    ])
    expect(client.sends).toHaveLength(1)
    expect(client.sends[0]?.text).toBe('Start only now')
    expect(store.conversationId).toBeTruthy()
  })

  it('prepares a runtime draft before staging a quick-menu message', async () => {
    const { store, transport } = await setup()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 1,
    })

    const created = await store.createConversationForMessage('external.codex', page.items[0]!)

    expect(created).toBe(true)
    expect(store.activeConversation).toBeNull()
    expect(store.selectedRuntimeId).toBe('external.codex')
    expect(store.stagedSources).toHaveLength(1)
    expect(store.chooserOpen).toBe(false)
  })

  it('uses the configured default Agent when the drawer starts a new session', async () => {
    const { store } = await setup()
    store.setDefaultRuntimeId('external.codex')

    await store.createConversation()

    expect(store.selectedRuntimeId).toBe('external.codex')
    expect(useAgentDrawerStore().activeState?.draft.runtimeId).toBe('external.codex')
  })

  it('uses the remembered model and default permission for a new drawer session', async () => {
    const { store } = await setup()
    store.setAvailableModelOptions([
      { value: 'provider/model-a', label: 'Model A' },
      { value: 'provider/model-b', label: 'Model B' },
    ])
    store.setDefaultModel('provider/model-b')

    await store.createConversation()

    expect(store.selectedModel).toBe('provider/model-b')
    expect(store.permissionMode).toBe('default')
    expect(useAgentDrawerStore().activeState?.draft.model).toBe('provider/model-b')
    expect(useAgentDrawerStore().activeState?.draft.permissionMode).toBe('default')
  })

  it('waits for a shared channel list before selecting a collaboration session', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const client = new DeferredListConversationClient()
    client.setRuntimes([runtime])
    const binding = {
      transportId: transport.descriptor().id,
      accountRef: transport.status().accountRef!,
      channelRef: 'product-collab',
    }
    const created = await client.createConversation(runtime.id, {
      idempotencyKey: 'history-selection',
      channelBinding: binding,
      hostTools: [],
    })
    const store = useCollaborationStore()
    store.configure(client, transport)
    await store.loadRuntimes()

    const firstBind = store.bindChannel(binding.channelRef)
    const secondBind = store.bindChannel(binding.channelRef)
    const selection = (async () => {
      await secondBind
      return store.selectConversation(created.handle.conversationId)
    })()

    client.releaseList()

    await firstBind
    expect(await selection).toBe(true)
    expect(store.conversationId).toBe(created.handle.conversationId)
  })

  it('reports when a collaboration session does not belong to the active channel', async () => {
    const { store, client } = await setup()
    const local = await client.createConversation(runtime.id, {
      idempotencyKey: 'local-history',
      hostTools: [],
    })

    expect(await store.selectConversation(local.handle.conversationId)).toBe(false)
    expect(store.error).toEqual({ kind: 'localized', key: 'errors.conversationUnavailable' })
  })

  it('clears the previous history before a collaboration session finishes loading', async () => {
    const { store, client } = await setup()
    const binding = { ...store.activeBinding! }
    const oldConversation = await client.createConversation(runtime.id, {
      idempotencyKey: 'old-collaboration-history',
      channelBinding: binding,
      hostTools: [],
    })
    const newConversation = await client.createConversation(runtime.id, {
      idempotencyKey: 'new-collaboration-history',
      channelBinding: binding,
      hostTools: [],
    })
    await client.sendMessage(oldConversation.handle.conversationId, 'Old history', {
      model: 'default',
      permissionMode: 'default',
    })
    await store.selectConversation(oldConversation.handle.conversationId)
    expect(store.turns).toHaveLength(1)

    let resolveNew!: (detail: ConversationDetail) => void
    vi.spyOn(client, 'getConversation').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNew = resolve
        }),
    )
    const selection = store.selectConversation(newConversation.handle.conversationId)
    expect(store.conversationId).toBe(newConversation.handle.conversationId)
    expect(store.turns).toEqual([])
    expect(store.loading).toBe(true)

    await Promise.resolve()
    resolveNew({
      summary: newConversation.summary!,
      collaboration: { turnContexts: [], drafts: [], deliveries: [] },
    })
    await selection

    expect(store.loading).toBe(false)
  })

  it('rejects an unavailable Agent without falling back', async () => {
    const { store, client } = await setup()
    client.setRuntimes([
      runtime,
      { ...runtime, id: 'external.offline', displayName: 'Offline', status: 'unavailable' },
    ])
    await store.loadRuntimes()

    expect(await store.createConversation('external.offline')).toBeNull()
    expect(store.selectedRuntimeId).toBe('external.codex')
    expect(store.error).toEqual({ kind: 'localized', key: 'errors.noRuntimeSelected' })
  })

  it('locks runtime selection after a bound conversation is active', async () => {
    const { store, client } = await setup()
    client.setRuntimes([runtime, { ...runtime, id: 'external.claude', displayName: 'Claude' }])
    await store.loadRuntimes()
    await store.createConversation('external.codex')
    await store.sendMessage('Start the session')
    const activeId = store.conversationId

    store.selectRuntime('external.claude')

    expect(store.conversationId).toBe(activeId)
    expect(store.selectedRuntimeId).toBe('external.codex')
  })

  it('creates one bound conversation and supports sourced and source-free turns', async () => {
    const { store, client, transport } = await setup()
    const preparedId = await store.createConversation('external.codex')
    expect({ preparedId, active: store.conversationId, error: store.error }).toMatchObject({
      preparedId: null,
      active: null,
      error: null,
    })
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 1,
    })
    store.stageMessage(page.items[0]!)
    await store.sendMessage('Summarize the decision')
    const conversationId = store.conversationId
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    await store.sendMessage('What remains unresolved?')

    expect(conversationId).toBeTruthy()
    expect(store.activeConversation?.channelBinding).toEqual(store.activeBinding)
    expect(client.sends[0]?.options.sources).toHaveLength(1)
    expect(client.sends[1]?.options.sources).toEqual([])
    expect(store.turns).toHaveLength(2)
  })

  it('preserves structured IPC error messages', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const client = new StructuredErrorConversationClient()
    client.setRuntimes([runtime])
    const store = useCollaborationStore()
    store.configure(client, transport)
    await store.loadRuntimes()
    await store.bindChannel('product-collab')
    store.selectRuntime('external.codex')

    await store.sendMessage('Fail on send')

    expect(store.error).toEqual({ kind: 'runtime', message: 'start codex thread: protocol failed' })
    expect(client.sends).toEqual([])
  })

  it('renames and archives bound conversations through the collaboration projection', async () => {
    const { store } = await setup()
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare release review')
    const conversationId = store.conversationId

    expect(await store.renameConversation(conversationId!, 'Release review')).toBe(true)
    expect(store.activeConversation?.title).toBe('Release review')

    expect(await store.archiveConversation(conversationId!)).toBe(true)
    expect(store.conversations).toEqual([])
    expect(store.conversationId).toBeNull()
    expect(store.activeConversation).toBeNull()
  })

  it('versions a Draft and repeated confirmation sends only once', async () => {
    const { store, transport } = await setup()
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )
    const updated = await store.updateDraft(draft!.draftId, 'Reviewed response')
    const send = vi.spyOn(transport, 'sendMessage')

    await store.deliverDraft(updated!.draftId)
    await store.deliverDraft(updated!.draftId)

    expect(send).toHaveBeenCalledTimes(1)
    expect(store.collaboration.deliveries[0]).toMatchObject({ status: 'sent' })
    expect(store.collaboration.deliveries[0]?.sentMessageRef?.messageServerId).toBeTruthy()
  })

  it('retries a failed Draft delivery with the same delivery identity', async () => {
    const transport = new FailBeforeSendTransport()
    const { store } = await setup(transport)
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )

    await store.deliverDraft(draft!.draftId)
    const failed = store.collaboration.deliveries[0]!
    expect(failed).toMatchObject({ status: 'failed', failureCode: 'transport' })

    await store.deliverDraft(draft!.draftId)

    expect(transport.attempts).toBe(2)
    expect(store.collaboration.deliveries[0]).toMatchObject({
      deliveryId: failed.deliveryId,
      idempotencyKey: failed.idempotencyKey,
      status: 'sent',
    })
    expect(store.error).toBeNull()
  })

  it('reconciles an uncertain delivery from Channel history without resending', async () => {
    const transport = new LoseAcknowledgementTransport()
    const { store } = await setup(transport)
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )

    await store.deliverDraft(draft!.draftId)
    expect(store.collaboration.deliveries[0]).toMatchObject({ status: 'failed' })

    await store.deliverDraft(draft!.draftId)

    expect(transport.attempts).toBe(1)
    expect(store.collaboration.deliveries[0]).toMatchObject({ status: 'sent' })
  })

  it('fails closed when delivery capability is unavailable', async () => {
    const { store } = await setup(new NoSendTransport())
    await store.createConversation('external.codex')
    await store.sendMessage('Prepare a response')
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe('completed'))
    const block = store.turns[0]!.blocks.find((value) => value.kind === 'assistantText')!
    const draft = await store.createDraft(
      0,
      block.id,
      block.kind === 'assistantText' ? block.text : '',
    )

    await store.deliverDraft(draft!.draftId)

    expect(store.error).toMatchObject({ kind: 'runtime', message: 'channelCapabilityUnavailable' })
    expect(store.collaboration.deliveries).toEqual([])
  })

  it('clears the account-bound projection after disconnect', async () => {
    const { store, transport } = await setup()
    await store.createConversation('external.codex')
    await transport.disconnect()
    await store.bindChannel('product-collab')

    expect(store.activeBinding).toBeNull()
    expect(store.conversationId).toBeNull()
    expect(store.conversations).toEqual([])
  })

  it('clears every tenant projection on dispose', async () => {
    const { store } = await setup()
    await store.createConversation('external.codex')
    store.openChooser()

    store.dispose()

    expect(store.runtimes).toEqual([])
    expect(store.conversations).toEqual([])
    expect(store.activeBinding).toBeNull()
    expect(store.conversationId).toBeNull()
    expect(store.turns).toEqual([])
    expect(store.collaboration).toEqual({ turnContexts: [], drafts: [], deliveries: [] })
    expect(store.stagedSources).toEqual([])
    expect(store.chooserOpen).toBe(false)
    expect(store.error).toBeNull()
  })
})
