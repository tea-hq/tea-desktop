import path from 'node:path'

import * as acpV1 from '@agentclientprotocol/sdk'
import * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

import type {
  ApprovalDecision,
  ConversationEvent,
  ConversationFailure,
  ConversationHistoryPage,
  HostToolDefinition,
  LoadConversationHistoryRequest,
  RuntimeDescriptor,
  RuntimeStatus,
} from '../../../src/features/conversation/contracts'
import {
  ConversationRuntimeError,
  parseRuntimeConversationBinding,
  unsupportedCapability,
  type ConversationEventListener,
  type ConversationRuntime,
  type RuntimeConversationBinding,
  type RuntimeConversationCommand,
  type RuntimeConversationCreateOptions,
  type RuntimeConversationHandle,
  type RuntimeConversationSnapshot,
} from '../runtime'
import {
  buildSubjectPrompt,
  MAX_RAW_SUBJECT_OUTPUT_CHARS,
  normalizeGeneratedSubject,
  prepareSubjectSource,
} from '../subject'
import type { ConversationToolScope } from '../toolBroker'
import {
  requireAvailableWorkspaceDirectory,
  type ConversationWorkspaceFileSystem,
} from '../workspace'
import type { AcpAgentDefinition } from './agentDefinition'
import {
  createAcpConversationBinding,
  validateAcpConversationBinding,
  type AcpConversationBinding,
} from './binding'
import {
  AcpConnectionFactory,
  type AcpAgentConnection,
  type AcpProtocolHandlers,
} from './connection'
import { AcpHostError } from './errors'
import {
  AcpMcpAttachmentFactory,
  type AcpMcpAttachmentBinding,
  type AcpMcpAttachmentFactoryPort,
} from './mcpAttachmentFactory'
import type { LaunchAcpAgentOptions } from './process'
import { AcpSessionActor, type AcpSessionScheduler } from './session'
import { acpProviderEnvironment } from './providerEnvironment'

const ACP_BASE_CAPABILITIES = ['approval', 'cancel', 'events', 'prompt', 'subject'] as const
const ACP_READY_CAPABILITIES = [
  ...ACP_BASE_CAPABILITIES,
  'history',
  'hostTools',
  'snapshot',
] as const
const MAX_WORKSPACE_PATH_CHARS = 4096
const DEFAULT_RESTORE_TIMEOUT_MS = 30_000
const DEFAULT_SUBJECT_TIMEOUT_MS = 60_000
const MAX_PENDING_SUBJECT_GENERATIONS = 4

export type AcpRuntimeScheduler = AcpSessionScheduler

export interface AcpConversationRuntimeOptions {
  restoreTimeoutMs?: number
  subjectTimeoutMs?: number
  scheduler?: AcpRuntimeScheduler
  status?: RuntimeStatus
  workspaceFileSystem?: ConversationWorkspaceFileSystem
}

const DEFAULT_SCHEDULER: AcpRuntimeScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface AcpConnectionFactoryPort {
  connect(
    definition: AcpAgentDefinition,
    launchOptions: LaunchAcpAgentOptions,
    handlers?: AcpProtocolHandlers,
    requiredWireVersion?: 1 | 2,
  ): Promise<AcpAgentConnection>
}

export interface AcpConversationToolBrokerPort {
  configureConversation(conversationId: string, definitions: HostToolDefinition[]): void
  openScope(conversationId: string): ConversationToolScope
  removeConversation(conversationId: string): void
}

export class AcpConversationRuntime implements ConversationRuntime {
  private readonly sessions = new Map<string, AcpSessionActor>()
  private readonly listeners = new Map<string, Set<ConversationEventListener>>()
  private readonly pendingCreations = new Map<string, Promise<RuntimeConversationHandle>>()
  private readonly configuredToolScopes = new Set<string>()
  private readonly pendingSubjectGenerations = new Map<string, PendingSubjectGeneration>()
  private readonly subjectTimeoutMs: number
  private readonly restoreTimeoutMs: number
  private readonly scheduler: AcpRuntimeScheduler
  private readonly status: RuntimeStatus
  private readonly workspaceFileSystem: ConversationWorkspaceFileSystem | undefined
  private nextSubjectId = 1
  private shutdownPromise: Promise<void> | null = null

  constructor(
    private readonly definition: AcpAgentDefinition,
    private readonly workspacePath: string,
    private readonly connectionFactory: AcpConnectionFactoryPort = new AcpConnectionFactory(),
    private readonly toolBroker?: AcpConversationToolBrokerPort,
    private readonly mcpAttachmentFactory: AcpMcpAttachmentFactoryPort = new AcpMcpAttachmentFactory(),
    options: AcpConversationRuntimeOptions = {},
  ) {
    if (
      !path.isAbsolute(workspacePath) ||
      workspacePath.length > MAX_WORKSPACE_PATH_CHARS ||
      workspacePath.includes('\0')
    ) {
      throw new ConversationRuntimeError(
        'invalidConfiguration',
        'ACP runtime workspace path must be absolute',
      )
    }
    this.subjectTimeoutMs = positiveInteger(
      options.subjectTimeoutMs,
      DEFAULT_SUBJECT_TIMEOUT_MS,
      'ACP subject timeout',
    )
    this.restoreTimeoutMs = positiveInteger(
      options.restoreTimeoutMs,
      DEFAULT_RESTORE_TIMEOUT_MS,
      'ACP restore timeout',
    )
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER
    this.status = options.status ?? 'unavailable'
    this.workspaceFileSystem = options.workspaceFileSystem
  }

  descriptor(): RuntimeDescriptor {
    return {
      id: this.definition.runtimeId,
      kind: 'externalCli',
      displayName: this.definition.displayName,
      capabilities:
        this.status === 'ready' ? [...ACP_READY_CAPABILITIES] : [...ACP_BASE_CAPABILITIES],
      status: this.status,
      models: [],
    }
  }

  async createConversation(
    conversationId: string,
    options: RuntimeConversationCreateOptions = { model: 'default' },
  ): Promise<RuntimeConversationHandle> {
    this.assertActive()
    if (!conversationId.trim()) {
      throw new ConversationRuntimeError('invalidState', 'conversation id must not be empty')
    }
    if (this.sessions.has(conversationId) || this.pendingCreations.has(conversationId)) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP conversation already exists: ${conversationId}`,
      )
    }

    const creation = this.createConversationOnce(conversationId, options)
    this.pendingCreations.set(conversationId, creation)
    try {
      return await creation
    } finally {
      if (this.pendingCreations.get(conversationId) === creation) {
        this.pendingCreations.delete(conversationId)
      }
    }
  }

  private async createConversationOnce(
    conversationId: string,
    options: RuntimeConversationCreateOptions,
  ): Promise<RuntimeConversationHandle> {
    const workspacePath = resolveWorkspacePath(this.workspacePath, options.workspacePath)
    this.listeners.set(conversationId, new Set())
    let actor: AcpSessionActor | undefined
    let connection: AcpAgentConnection | undefined
    let mcpBinding: AcpMcpAttachmentBinding | undefined
    const handlers: AcpProtocolHandlers = {
      sessionUpdate: (input) => requireActor(actor, conversationId).handleSessionUpdate(input),
      requestPermission: (input) =>
        requireActor(actor, conversationId).handlePermissionRequest(input),
    }
    try {
      await requireAvailableWorkspaceDirectory(workspacePath, {
        fileSystem: this.workspaceFileSystem,
      })
      connection = await this.connectionFactory.connect(
        this.definition,
        {
          cwd: workspacePath,
          injectedEnvironment: acpProviderEnvironment(this.definition, options),
        },
        handlers,
      )
      const scope = this.configuredToolScopes.has(conversationId)
        ? this.requireToolBroker().openScope(conversationId)
        : undefined
      const hostTools = scope?.definitions() ?? []
      mcpBinding =
        scope && hostTools.length > 0
          ? await this.mcpAttachmentFactory.create(scope, connection.protocol.wireVersion)
          : undefined
      actor = new AcpSessionActor(
        conversationId,
        workspacePath,
        connection,
        this.definition.sessionConfiguration,
        (event) => this.emit(event),
        undefined,
        mcpBinding,
      )
      const nativeSessionId = await actor.createSession()
      if (this.shutdownPromise) {
        await actor.shutdown()
        throw new ConversationRuntimeError(
          'shutDown',
          'ACP conversation runtime shut down during session creation',
        )
      }
      this.sessions.set(conversationId, actor)
      return {
        conversationId,
        runtimeId: this.definition.runtimeId,
        nativeSessionId,
        binding: createAcpConversationBinding(
          { definition: this.definition, workspacePath, hostTools },
          nativeSessionId,
          connection.protocol.wireVersion,
        ),
      }
    } catch (cause) {
      this.listeners.delete(conversationId)
      await actor?.shutdown().catch(() => undefined)
      if (!actor) await mcpBinding?.attachment.close().catch(() => undefined)
      await connection?.close().catch(() => undefined)
      this.removeConfiguredToolScope(conversationId)
      throw runtimeConnectionError(cause)
    }
  }

  async restoreConversation(
    conversationId: string,
    binding: RuntimeConversationBinding,
    options: RuntimeConversationCreateOptions = { model: 'default' },
  ): Promise<RuntimeConversationHandle> {
    const bindingPath = parseRuntimeConversationBinding(binding).workspacePath
    this.assertActive()
    if (!conversationId.trim()) {
      throw new ConversationRuntimeError('invalidState', 'conversation id must not be empty')
    }
    if (this.sessions.has(conversationId) || this.pendingCreations.has(conversationId)) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP conversation already exists: ${conversationId}`,
      )
    }
    let scope: ConversationToolScope | undefined
    let hostTools: HostToolDefinition[]
    let validated: AcpConversationBinding
    try {
      scope = this.configuredToolScopes.has(conversationId)
        ? this.requireToolBroker().openScope(conversationId)
        : undefined
      hostTools = scope?.definitions() ?? []
      validated = validateAcpConversationBinding(binding, {
        definition: this.definition,
        workspacePath: bindingPath,
        hostTools,
      })
    } catch (cause) {
      try {
        this.removeConfiguredToolScope(conversationId)
      } catch (cleanup) {
        const primary = runtimeConnectionError(cause)
        throw new ConversationRuntimeError(primary.code, primary.message, primary.retryable, {
          cause: new AggregateError([cause, cleanup], 'ACP restore preparation cleanup failed'),
        })
      }
      throw runtimeConnectionError(cause)
    }
    const restoration = this.restoreConversationOnce(
      conversationId,
      validated,
      scope,
      hostTools,
      options,
    )
    this.pendingCreations.set(conversationId, restoration)
    try {
      return await restoration
    } finally {
      if (this.pendingCreations.get(conversationId) === restoration) {
        this.pendingCreations.delete(conversationId)
      }
    }
  }

  private async restoreConversationOnce(
    conversationId: string,
    binding: AcpConversationBinding,
    scope: ConversationToolScope | undefined,
    hostTools: HostToolDefinition[],
    options: RuntimeConversationCreateOptions,
  ): Promise<RuntimeConversationHandle> {
    this.listeners.set(conversationId, new Set())
    let actor: AcpSessionActor | undefined
    let connection: AcpAgentConnection | undefined
    let mcpBinding: AcpMcpAttachmentBinding | undefined
    const handlers: AcpProtocolHandlers = {
      sessionUpdate: (input) => requireActor(actor, conversationId).handleSessionUpdate(input),
      requestPermission: (input) =>
        requireActor(actor, conversationId).handlePermissionRequest(input),
    }
    try {
      await requireAvailableWorkspaceDirectory(binding.workspacePath, {
        fileSystem: this.workspaceFileSystem,
      })
      connection = await this.connectionFactory.connect(
        this.definition,
        {
          cwd: binding.workspacePath,
          injectedEnvironment: acpProviderEnvironment(this.definition, options),
        },
        handlers,
        binding.protocol.version,
      )
      if (connection.protocol.wireVersion !== binding.protocol.version) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          'ACP recovery connection used the wrong wire version',
        )
      }
      mcpBinding =
        scope && hostTools.length > 0
          ? await this.mcpAttachmentFactory.create(scope, binding.protocol.version)
          : undefined
      actor = new AcpSessionActor(
        conversationId,
        binding.workspacePath,
        connection,
        this.definition.sessionConfiguration,
        (event) => this.emit(event),
        undefined,
        mcpBinding,
      )
      await actor.restoreSession(binding.nativeSessionId, this.restoreTimeoutMs, this.scheduler)
      if (this.shutdownPromise) {
        await actor.shutdown()
        throw new ConversationRuntimeError(
          'shutDown',
          'ACP conversation runtime shut down during session restore',
        )
      }
      this.sessions.set(conversationId, actor)
      return {
        conversationId,
        runtimeId: this.definition.runtimeId,
        nativeSessionId: binding.nativeSessionId,
        binding: structuredClone(binding),
      }
    } catch (cause) {
      this.listeners.delete(conversationId)
      await actor?.shutdown().catch(() => undefined)
      if (!actor) await mcpBinding?.attachment.close().catch(() => undefined)
      await connection?.close().catch(() => undefined)
      this.removeConfiguredToolScope(conversationId)
      throw runtimeConnectionError(cause)
    }
  }

  async configureHostTools(
    conversationId: string,
    definitions: HostToolDefinition[],
  ): Promise<void> {
    this.assertActive()
    if (this.sessions.has(conversationId) || this.pendingCreations.has(conversationId)) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP HostTools cannot change after conversation creation starts: ${conversationId}`,
      )
    }
    this.requireToolBroker().configureConversation(conversationId, definitions)
    this.configuredToolScopes.add(conversationId)
  }

  async closeConversation(conversationId: string): Promise<void> {
    this.assertActive()
    if (!conversationId.trim()) {
      throw new ConversationRuntimeError('invalidState', 'conversation id must not be empty')
    }
    await this.pendingCreations.get(conversationId)?.catch(() => undefined)
    await this.closeConversationResources(conversationId)
  }

  async deleteConversation(
    conversationId: string,
    binding: RuntimeConversationBinding,
    options: RuntimeConversationCreateOptions = { model: 'default' },
  ): Promise<void> {
    this.assertActive()
    if (!conversationId.trim()) {
      throw new ConversationRuntimeError('invalidState', 'conversation id must not be empty')
    }

    const parsed = parseRuntimeConversationBinding(binding)
    const validated = validateAcpConversationBinding(parsed, {
      definition: this.definition,
      workspacePath: parsed.workspacePath,
      hostTools: [],
      validateHostTools: false,
    })
    await this.pendingCreations.get(conversationId)?.catch(() => undefined)

    const session = this.sessions.get(conversationId)
    if (session) {
      if (session.nativeSessionId !== validated.nativeSessionId) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          'ACP active session does not match the recorded binding',
        )
      }
      let primary: unknown
      try {
        await session.deleteSession()
      } catch (cause) {
        primary = cause
      }
      if (primary instanceof ConversationRuntimeError && primary.code === 'unsupportedCapability') {
        throw primary
      }
      let cleanup: unknown
      try {
        await this.closeConversationResources(conversationId)
      } catch (cause) {
        cleanup = cause
      }
      if (primary && cleanup) throw preserveRuntimeError(primary, cleanup)
      if (primary) throw runtimeConnectionError(primary)
      if (cleanup) throw runtimeConnectionError(cleanup)
      return
    }

    await this.deleteInactiveConversation(validated, options)
    this.removeConfiguredToolScope(conversationId)
  }

  async loadSnapshot(conversationId: string): Promise<RuntimeConversationSnapshot> {
    this.assertActive()
    return this.requireSession(conversationId).snapshot()
  }

  async loadHistory(request: LoadConversationHistoryRequest): Promise<ConversationHistoryPage> {
    this.assertActive()
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) {
      throw new ConversationRuntimeError('invalidHistoryLimit', 'ACP history limit is invalid')
    }
    const turns = this.requireSession(request.conversationId).snapshot().turns
    const end = parseHistoryCursor(request.cursor, turns.length)
    const start = Math.max(0, end - request.limit)
    return {
      items: structuredClone(turns.slice(start, end)),
      nextCursor: start > 0 ? String(start) : null,
      hasMore: start > 0,
      startIndex: start,
    }
  }

  async generateSubject(sourceText: string): Promise<string> {
    this.assertActive()
    const source = prepareSubjectSource(sourceText)
    if (!source) {
      throw new ConversationRuntimeError('invalidState', 'ACP subject source must not be empty')
    }
    const key = buildSubjectPrompt(source)
    const existing = this.pendingSubjectGenerations.get(key)
    if (existing) return existing.promise
    if (this.pendingSubjectGenerations.size >= MAX_PENDING_SUBJECT_GENERATIONS) {
      throw new ConversationRuntimeError(
        'invalidState',
        'ACP subject generation concurrency limit was reached',
        true,
      )
    }

    const operation = new AcpSubjectOperation()
    const promise = this.runSubjectGeneration(source, operation)
    const pending = { operation, promise }
    this.pendingSubjectGenerations.set(key, pending)
    const remove = () => {
      if (this.pendingSubjectGenerations.get(key) === pending) {
        this.pendingSubjectGenerations.delete(key)
      }
    }
    void promise.then(remove, remove)
    return promise
  }

  async sendMessage(command: RuntimeConversationCommand): Promise<void> {
    this.assertActive()
    validateCommandOptions(command)
    await this.requireSession(command.conversationId).prompt(command.text, command.options)
  }

  async cancel(conversationId: string): Promise<void> {
    this.assertActive()
    await this.requireSession(conversationId).cancel()
  }

  async resolveApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    this.assertActive()
    this.requireSession(conversationId).resolveApproval(approvalId, decision)
  }

  subscribe(conversationId: string, listener: ConversationEventListener): () => void {
    this.assertActive()
    this.requireSession(conversationId)
    const listeners = this.listeners.get(conversationId)!
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownAll()
    return this.shutdownPromise
  }

  private requireSession(conversationId: string): AcpSessionActor {
    const session = this.sessions.get(conversationId)
    if (!session) {
      throw new ConversationRuntimeError(
        'unknownConversation',
        `ACP conversation is not active: ${conversationId}`,
      )
    }
    return session
  }

  private emit(event: ConversationEvent): void {
    for (const listener of this.listeners.get(event.conversationId) ?? []) {
      try {
        listener(structuredClone(event))
      } catch {
        // A renderer subscriber cannot break the authoritative runtime state machine.
      }
    }
  }

  private async shutdownAll(): Promise<void> {
    for (const pending of this.pendingSubjectGenerations.values()) {
      pending.operation.cancel(
        new ConversationRuntimeError('shutDown', 'ACP subject generation was shut down'),
      )
    }
    await Promise.allSettled(
      [...this.pendingSubjectGenerations.values()].map((pending) => pending.promise),
    )
    await Promise.allSettled([...this.pendingCreations.values()])
    const conversationIds = new Set([...this.sessions.keys(), ...this.configuredToolScopes])
    const failures: unknown[] = []
    for (const conversationId of [...conversationIds].sort((left, right) =>
      left.localeCompare(right),
    )) {
      try {
        await this.closeConversationResources(conversationId)
      } catch (cause) {
        failures.push(cause)
      }
    }
    this.sessions.clear()
    this.listeners.clear()
    for (const conversationId of [...this.configuredToolScopes]) {
      try {
        this.removeConfiguredToolScope(conversationId)
      } catch (cause) {
        failures.push(cause)
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'ACP runtime shutdown failed')
  }

  private async runSubjectGeneration(
    sourceText: string,
    operation: AcpSubjectOperation,
  ): Promise<string> {
    const worker = this.generateSubjectOnce(sourceText, operation)
    const timer = this.scheduler.setTimeout(
      () =>
        operation.cancel(
          new ConversationRuntimeError(
            'connectionFailed',
            'ACP subject generation timed out',
            true,
          ),
        ),
      this.subjectTimeoutMs,
    )
    try {
      return await operation.race(worker)
    } finally {
      this.scheduler.clearTimeout(timer)
      await worker.catch(() => undefined)
      operation.finish()
    }
  }

  private async generateSubjectOnce(
    sourceText: string,
    operation: AcpSubjectOperation,
  ): Promise<string> {
    const subjectId = `acp-subject-${this.nextSubjectId++}`
    const collector = new AcpSubjectCollector(subjectId)
    let actor: AcpSessionActor | undefined
    let connection: AcpAgentConnection | undefined
    let primary: unknown
    try {
      await requireAvailableWorkspaceDirectory(this.workspacePath, {
        fileSystem: this.workspaceFileSystem,
      })
      const connectionPromise = this.connectionFactory.connect(
        this.definition,
        { cwd: this.workspacePath },
        {
          sessionUpdate: (input) => requireActor(actor, subjectId).handleSessionUpdate(input),
          requestPermission: async () => {
            throw new ConversationRuntimeError(
              'invalidState',
              'ACP subject sessions cannot request permission',
            )
          },
        },
      )
      void connectionPromise.then(
        (lateConnection) => {
          if (operation.isCancelled) void lateConnection.close().catch(() => undefined)
        },
        () => undefined,
      )
      connection = await operation.race(connectionPromise)
      actor = new AcpSessionActor(
        subjectId,
        this.workspacePath,
        connection,
        this.definition.sessionConfiguration,
        (event) => collector.accept(event),
      )
      operation.attach(actor)
      await operation.race(actor.createSession())
      await operation.race(actor.prompt(buildSubjectPrompt(sourceText)))
      return collector.result(sourceText)
    } catch (cause) {
      primary = cause
      throw runtimeConnectionError(cause)
    } finally {
      try {
        if (actor) await actor.shutdown()
        else await connection?.close()
      } catch (cleanup) {
        if (!primary) throw runtimeConnectionError(cleanup)
      }
    }
  }

  private async closeConversationResources(conversationId: string): Promise<void> {
    const session = this.sessions.get(conversationId)
    this.sessions.delete(conversationId)
    this.listeners.delete(conversationId)
    const failures: unknown[] = []
    if (session) {
      try {
        await session.shutdown()
      } catch (cause) {
        failures.push(cause)
      }
    }
    try {
      this.removeConfiguredToolScope(conversationId)
    } catch (cause) {
      failures.push(cause)
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `ACP conversation close failed: ${conversationId}`)
    }
  }

  private async deleteInactiveConversation(
    binding: AcpConversationBinding,
    options: RuntimeConversationCreateOptions,
  ): Promise<void> {
    let connection: AcpAgentConnection | undefined
    let primary: unknown
    try {
      await requireAvailableWorkspaceDirectory(binding.workspacePath, {
        fileSystem: this.workspaceFileSystem,
      })
      connection = await this.connectionFactory.connect(
        this.definition,
        {
          cwd: binding.workspacePath,
          injectedEnvironment: acpProviderEnvironment(this.definition, options),
        },
        undefined,
        binding.protocol.version,
      )
      if (connection.protocol.wireVersion !== binding.protocol.version) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          'ACP deletion connection used the wrong wire version',
        )
      }
      if (!connection.protocol.initialization.supportsDeleteSession) {
        throw unsupportedCapability('delete')
      }
      if (connection.protocol.wireVersion === 1) {
        await connection.protocol.context.request(acpV1.methods.agent.session.delete, {
          sessionId: binding.nativeSessionId,
        })
      } else {
        await connection.protocol.context.request(acpV2.methods.agent.session.delete, {
          sessionId: binding.nativeSessionId,
        })
      }
    } catch (cause) {
      primary = cause
    }

    let cleanup: unknown
    try {
      await connection?.close()
    } catch (cause) {
      cleanup = cause
    }
    if (primary && cleanup) throw preserveRuntimeError(primary, cleanup)
    if (primary) throw runtimeConnectionError(primary)
    if (cleanup) throw runtimeConnectionError(cleanup)
  }

  private assertActive(): void {
    if (this.shutdownPromise) {
      throw new ConversationRuntimeError('shutDown', 'ACP conversation runtime has shut down')
    }
  }

  private requireToolBroker(): AcpConversationToolBrokerPort {
    if (!this.toolBroker) {
      throw new ConversationRuntimeError(
        'invalidConfiguration',
        'ACP HostTool broker is not configured',
      )
    }
    return this.toolBroker
  }

  private removeConfiguredToolScope(conversationId: string): void {
    if (!this.configuredToolScopes.delete(conversationId)) return
    this.requireToolBroker().removeConversation(conversationId)
  }
}

function requireActor(actor: AcpSessionActor | undefined, conversationId: string): AcpSessionActor {
  if (!actor) {
    throw new ConversationRuntimeError(
      'invalidState',
      `ACP callback arrived before session ownership was installed: ${conversationId}`,
    )
  }
  return actor
}

function validateCommandOptions(command: RuntimeConversationCommand): void {
  if (command.options.sources && command.options.sources.length > 0) {
    throw new ConversationRuntimeError(
      'invalidConfiguration',
      'ACP collaboration source mapping is not implemented',
    )
  }
}

function runtimeConnectionError(cause: unknown): ConversationRuntimeError {
  if (cause instanceof ConversationRuntimeError) return cause
  if (cause instanceof AcpHostError) {
    return new ConversationRuntimeError('connectionFailed', cause.message, cause.retryable, {
      cause,
    })
  }
  return new ConversationRuntimeError('connectionFailed', 'ACP Agent connection failed', true, {
    cause,
  })
}

function preserveRuntimeError(primary: unknown, cleanup: unknown): unknown {
  const normalized = runtimeConnectionError(primary)
  return new ConversationRuntimeError(normalized.code, normalized.message, normalized.retryable, {
    cause: new AggregateError([primary, cleanup], 'ACP conversation deletion cleanup failed'),
  })
}

function resolveWorkspacePath(defaultPath: string, requestedPath?: string): string {
  const value = requestedPath ?? defaultPath
  if (
    !path.isAbsolute(value) ||
    value.length > MAX_WORKSPACE_PATH_CHARS ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    throw new ConversationRuntimeError(
      'invalidConfiguration',
      'ACP conversation workspace path must be an absolute path',
    )
  }
  return value
}

interface PendingSubjectGeneration {
  operation: AcpSubjectOperation
  promise: Promise<string>
}

class AcpSubjectOperation {
  readonly cancelled: Promise<never>
  private rejectCancellation!: (cause: unknown) => void
  private actor: AcpSessionActor | undefined
  private cancelledWith: ConversationRuntimeError | undefined
  private finished = false

  constructor() {
    this.cancelled = new Promise((_, reject) => {
      this.rejectCancellation = reject
    })
  }

  get isCancelled(): boolean {
    return this.cancelledWith !== undefined
  }

  attach(actor: AcpSessionActor): void {
    this.actor = actor
    if (this.cancelledWith) void actor.shutdown().catch(() => undefined)
  }

  race<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([promise, this.cancelled])
  }

  cancel(cause: ConversationRuntimeError): void {
    if (this.finished || this.cancelledWith) return
    this.cancelledWith = cause
    this.rejectCancellation(cause)
    void this.actor?.shutdown().catch(() => undefined)
  }

  finish(): void {
    this.finished = true
  }
}

class AcpSubjectCollector {
  private output = ''
  private outputCharacters = 0
  private overflow = false
  private invalidOutput = false
  private terminal: 'finished' | ConversationFailure | undefined

  constructor(private readonly subjectId: string) {}

  accept(event: ConversationEvent): void {
    if (event.conversationId !== this.subjectId || this.terminal) return
    if (event.event.type === 'messageDelta') {
      const characters = [...event.event.text]
      const remaining = MAX_RAW_SUBJECT_OUTPUT_CHARS - this.outputCharacters
      if (characters.length > remaining) this.overflow = true
      if (remaining > 0) {
        this.output += characters.slice(0, remaining).join('')
        this.outputCharacters += Math.min(characters.length, remaining)
      }
      return
    }
    if (event.event.type === 'runFinished') this.terminal = 'finished'
    if (event.event.type === 'runFailed') this.terminal = event.event.failure
    if (
      event.event.type === 'toolRequested' ||
      event.event.type === 'toolProgress' ||
      event.event.type === 'toolCompleted' ||
      event.event.type === 'approvalRequested'
    ) {
      this.invalidOutput = true
    }
  }

  result(sourceText: string): string {
    if (this.overflow) {
      throw new ConversationRuntimeError('invalidState', 'ACP subject output exceeded its limit')
    }
    if (this.invalidOutput) {
      throw new ConversationRuntimeError('invalidState', 'ACP subject session used a tool')
    }
    if (this.terminal !== 'finished') {
      const failure = this.terminal
      throw new ConversationRuntimeError(
        'connectionFailed',
        failure?.message ?? 'ACP subject Agent failed',
        failure?.retryable ?? false,
      )
    }
    const subject = normalizeGeneratedSubject(sourceText, this.output)
    if (!subject) {
      throw new ConversationRuntimeError('invalidState', 'ACP Agent returned an invalid subject')
    }
    return subject
  }
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new ConversationRuntimeError(
      'invalidConfiguration',
      `${label} must be a positive integer`,
    )
  }
  return resolved
}

function parseHistoryCursor(cursor: string | undefined, turnCount: number): number {
  if (cursor === undefined) return turnCount
  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    throw new ConversationRuntimeError('invalidHistoryCursor', 'ACP history cursor is invalid')
  }
  const value = Number(cursor)
  if (!Number.isSafeInteger(value) || value > turnCount) {
    throw new ConversationRuntimeError('invalidHistoryCursor', 'ACP history cursor is invalid')
  }
  return value
}
