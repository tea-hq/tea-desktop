import * as acpV1 from '@agentclientprotocol/sdk'
import * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

import type {
  ApprovalDecision,
  ConversationEvent,
  ConversationEventKind,
  ConversationFailure,
  ConversationTurn,
  SendMessageOptions,
} from '../../../src/features/conversation/contracts'
import {
  createConversationTurn,
  reduceConversationTurn,
} from '../../../src/features/conversation/timelineReducer'
import {
  ConversationRuntimeError,
  unsupportedCapability,
  type RuntimeConversationSnapshot,
} from '../runtime'
import type {
  AcpAgentConnection,
  AcpPermissionRequest,
  AcpPermissionResponse,
  AcpSessionUpdateNotification,
} from './connection'
import type { AcpSessionConfigurationDefinition } from './agentDefinition'
import { AcpHostError } from './errors'
import type { AcpMcpAttachmentBinding } from './mcpAttachmentFactory'
import { AcpTurnOperation } from './operation'
import { AcpPermissionCoordinator } from './permissions'
import { AcpEventProjector } from './projector'
import { AcpV1ReplayCollector } from './replay'
import { AcpSessionConfiguration } from './sessionConfiguration'

type SessionLifecycle =
  'new' | 'creating' | 'restoring' | 'active' | 'failed' | 'closing' | 'closed'

export interface AcpSessionScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

const DEFAULT_SESSION_SCHEDULER: AcpSessionScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class AcpSessionActor {
  private readonly projector: AcpEventProjector
  private readonly permissions: AcpPermissionCoordinator
  private readonly bufferedUpdates: AcpSessionUpdateNotification[] = []
  private readonly turns: ConversationTurn[] = []
  private readonly configuration: AcpSessionConfiguration
  private lifecycle: SessionLifecycle = 'new'
  private sessionId: string | null = null
  private replayCollector: AcpV1ReplayCollector | null = null
  private restoreFailure: unknown | null = null
  private projectionComplete = false
  private sequence = 0
  private nextOperationId = 1
  private activeOperation: AcpTurnOperation | null = null
  private promptPending = false
  private shutdownPromise: Promise<void> | null = null
  private resourceClosePromise: Promise<void> | null = null

  constructor(
    readonly conversationId: string,
    private readonly workspacePath: string,
    private readonly connection: Pick<AcpAgentConnection, 'protocol' | 'closed' | 'close'>,
    configurationDefinition: AcpSessionConfigurationDefinition,
    private readonly emit: (event: ConversationEvent) => void,
    createApprovalId?: () => string,
    private readonly mcpBinding?: AcpMcpAttachmentBinding,
  ) {
    this.projector = new AcpEventProjector(connection.protocol.wireVersion)
    this.permissions = new AcpPermissionCoordinator(createApprovalId)
    this.configuration = new AcpSessionConfiguration(
      configurationDefinition,
      connection.protocol.wireVersion,
    )
    void connection.closed.then(
      () => this.handleConnectionClosed(),
      (cause) => this.handleConnectionClosed(cause),
    )
    void mcpBinding?.attachment.closed.then(
      () => this.handleAttachmentClosed(),
      (cause) => this.handleAttachmentClosed(cause),
    )
  }

  get nativeSessionId(): string {
    return this.requireSessionId()
  }

  async createSession(): Promise<string> {
    if (this.lifecycle !== 'new') {
      throw new ConversationRuntimeError('invalidState', 'ACP session creation already started')
    }
    this.lifecycle = 'creating'
    try {
      const response = await this.requestNewSession()
      const sessionId = response.sessionId
      if (!sessionId.trim()) {
        throw new ConversationRuntimeError('invalidState', 'ACP session id must not be empty')
      }
      this.sessionId = sessionId
      this.configuration.acceptSessionResponse(response)
      this.projectionComplete = true
      this.lifecycle = 'active'
      for (const update of this.bufferedUpdates.splice(0)) await this.handleSessionUpdate(update)
      return sessionId
    } catch (cause) {
      this.lifecycle = 'failed'
      await this.closeResources().catch(() => undefined)
      throw cause
    }
  }

  async restoreSession(
    sessionId: string,
    timeoutMs: number,
    scheduler: AcpSessionScheduler = DEFAULT_SESSION_SCHEDULER,
  ): Promise<void> {
    if (this.lifecycle !== 'new') {
      throw new ConversationRuntimeError('invalidState', 'ACP session restore already started')
    }
    if (!sessionId.trim()) {
      throw new ConversationRuntimeError('invalidState', 'ACP session id must not be empty')
    }
    this.sessionId = sessionId
    this.lifecycle = 'restoring'
    this.restoreFailure = null
    try {
      if (
        this.connection.protocol.wireVersion === 1 &&
        this.connection.protocol.initialization.supportsLoadSession
      ) {
        const collector = new AcpV1ReplayCollector(this.conversationId, sessionId)
        this.replayCollector = collector
        const response = await withRestoreTimeout(
          this.requestLoadSession(sessionId),
          timeoutMs,
          this.conversationId,
          scheduler,
        )
        this.configuration.acceptSessionResponse(response)
        if (this.restoreFailure) throw this.restoreFailure
        const replay = collector.finish()
        this.turns.push(...replay.turns)
        this.sequence = replay.lastEventSequence
        this.projectionComplete = true
      } else {
        if (!this.connection.protocol.initialization.supportsResumeSession) {
          throw new ConversationRuntimeError(
            'unsupportedCapability',
            'ACP Agent does not support restoring the recorded session',
          )
        }
        const response = await withRestoreTimeout(
          this.requestResumeSession(sessionId),
          timeoutMs,
          this.conversationId,
          scheduler,
        )
        this.configuration.acceptSessionResponse(response)
        if (this.restoreFailure) throw this.restoreFailure
      }
      this.replayCollector = null
      this.lifecycle = 'active'
    } catch (cause) {
      this.replayCollector = null
      this.lifecycle = 'failed'
      await this.closeResources().catch(() => undefined)
      throw cause
    }
  }

  snapshot(): RuntimeConversationSnapshot {
    this.assertActive()
    if (!this.projectionComplete) throw unsupportedCapability('snapshot')
    return {
      conversationId: this.conversationId,
      nativeSessionId: this.requireSessionId(),
      turns: structuredClone(this.turns),
    }
  }

  async prompt(
    text: string,
    options?: Pick<SendMessageOptions, 'model' | 'permissionMode'>,
  ): Promise<void> {
    this.assertActive()
    if (this.activeOperation || this.promptPending) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP conversation already has an active turn: ${this.conversationId}`,
      )
    }
    if (!text.trim()) {
      throw new ConversationRuntimeError('invalidState', 'ACP prompt must not be empty')
    }

    this.promptPending = true
    try {
      const configuration = options ? this.applyConfiguration(options) : undefined
      if (configuration) await configuration
      this.assertActive()

      const operation = new AcpTurnOperation(this.nextOperationId++)
      this.activeOperation = operation
      this.turns.push(
        createConversationTurn(
          `acp-turn-${operation.id}`,
          `acp-prompt-${operation.id}`,
          text,
          [],
          this.sequence,
        ),
      )
      this.emitKind({ type: 'runStarted' })
      void this.dispatchPrompt(operation, text)
      await operation.completed
    } finally {
      this.promptPending = false
    }
  }

  async handleSessionUpdate(input: AcpSessionUpdateNotification): Promise<void> {
    if (this.lifecycle === 'creating') {
      this.bufferedUpdates.push(input)
      return
    }
    if (this.lifecycle === 'restoring') {
      try {
        this.validateRestoringUpdate(input)
        this.configuration.acceptSessionUpdate(input.notification.update)
      } catch (cause) {
        this.restoreFailure ??= cause
        throw cause
      }
      return
    }
    this.assertActive()
    try {
      this.validateUpdateOwner(input)
      this.configuration.acceptSessionUpdate(input.notification.update)
      if (!this.activeOperation && isPassiveUpdate(input)) {
        this.projector.project(input)
        return
      }
      if (!this.activeOperation) {
        throw new ConversationRuntimeError(
          'invalidState',
          `ACP update arrived without an active turn: ${this.conversationId}`,
        )
      }
      const projected = this.projector.project(input)
      for (const event of projected.events) this.emitKind(event)
      if (projected.terminal) this.finishOperation(this.activeOperation, projected.terminal)
    } catch (cause) {
      this.failActiveOperation(cause)
      throw cause
    }
  }

  handlePermissionRequest(input: AcpPermissionRequest): Promise<AcpPermissionResponse> {
    this.assertActive()
    try {
      this.validatePermissionOwner(input)
      if (!this.activeOperation) {
        throw new ConversationRuntimeError(
          'invalidState',
          `ACP permission arrived without an active turn: ${this.conversationId}`,
        )
      }
      return this.permissions.request(this.conversationId, input, (event) => this.emitKind(event))
    } catch (cause) {
      this.failActiveOperation(cause)
      throw cause
    }
  }

  resolveApproval(approvalId: string, decision: ApprovalDecision): void {
    this.assertActive()
    this.permissions.resolve(this.conversationId, approvalId, decision)
  }

  async cancel(): Promise<void> {
    this.assertActive()
    const operation = this.activeOperation
    if (!operation) return
    const notification = this.notifyCancellation()
    this.finishOperation(operation, {
      type: 'runFailed',
      failure: { code: 'cancelled', retryable: false },
    })
    await notification.catch(() => undefined)
  }

  async deleteSession(): Promise<void> {
    this.assertActive()
    if (!this.connection.protocol.initialization.supportsDeleteSession) {
      throw unsupportedCapability('delete')
    }

    const sessionId = this.requireSessionId()
    let primary: unknown
    try {
      await this.cancel()
      if (this.connection.protocol.wireVersion === 1) {
        await this.connection.protocol.context.request(acpV1.methods.agent.session.delete, {
          sessionId,
        })
      } else {
        await this.connection.protocol.context.request(acpV2.methods.agent.session.delete, {
          sessionId,
        })
      }
    } catch (cause) {
      primary = cause
    }

    this.lifecycle = 'closing'
    this.permissions.cancelAll()
    let cleanup: unknown
    try {
      await this.closeResources()
    } catch (cause) {
      cleanup = cause
    }
    this.lifecycle = 'closed'

    if (primary && cleanup) throw preserveDeleteError(primary, cleanup)
    if (primary) throw primary
    if (cleanup) throw cleanup
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownOnce()
    return this.shutdownPromise
  }

  private async dispatchPrompt(operation: AcpTurnOperation, text: string): Promise<void> {
    try {
      const sessionId = this.requireSessionId()
      if (this.connection.protocol.wireVersion === 1) {
        const response = await this.connection.protocol.context.request(
          acpV1.methods.agent.session.prompt,
          {
            sessionId,
            prompt: [{ type: 'text', text }],
          },
        )
        this.finishOperation(operation, this.projector.terminalFromV1(response.stopReason))
      } else {
        await this.connection.protocol.context.request(acpV2.methods.agent.session.prompt, {
          sessionId,
          prompt: [{ type: 'text', text }],
        })
      }
    } catch (cause) {
      this.failOperation(operation, cause)
    }
  }

  private async requestNewSession(): Promise<acpV1.NewSessionResponse | acpV2.NewSessionResponse> {
    const binding = this.mcpBinding
    const configuration = binding?.configuration
    const protocol = this.connection.protocol
    if (protocol.wireVersion === 1) {
      if (configuration && configuration.wireVersion !== 1) throw wrongMcpWireVersion()
      const request = protocol.context.request(acpV1.methods.agent.session.new, {
        cwd: this.workspacePath,
        mcpServers: configuration ? [configuration.server] : [],
      })
      const [response] = await Promise.all([
        request,
        binding?.attachment.ready ?? Promise.resolve(),
      ])
      return response
    }
    if (configuration && configuration.wireVersion !== 2) throw wrongMcpWireVersion()
    const request = protocol.context.request(acpV2.methods.agent.session.new, {
      cwd: this.workspacePath,
      mcpServers: configuration ? [configuration.server] : [],
    })
    const [response] = await Promise.all([request, binding?.attachment.ready ?? Promise.resolve()])
    return response
  }

  private async requestLoadSession(sessionId: string): Promise<acpV1.LoadSessionResponse> {
    const binding = this.mcpBinding
    const configuration = binding?.configuration
    const protocol = this.connection.protocol
    if (protocol.wireVersion !== 1) throw wrongRestoreWireVersion()
    if (configuration && configuration.wireVersion !== 1) throw wrongMcpWireVersion()
    const request = protocol.context.request(acpV1.methods.agent.session.load, {
      sessionId,
      cwd: this.workspacePath,
      mcpServers: configuration ? [configuration.server] : [],
    })
    const [response] = await Promise.all([request, binding?.attachment.ready ?? Promise.resolve()])
    return response
  }

  private async requestResumeSession(
    sessionId: string,
  ): Promise<acpV1.ResumeSessionResponse | acpV2.ResumeSessionResponse> {
    const binding = this.mcpBinding
    const configuration = binding?.configuration
    const protocol = this.connection.protocol
    if (protocol.wireVersion === 1) {
      if (configuration && configuration.wireVersion !== 1) throw wrongMcpWireVersion()
      const request = protocol.context.request(acpV1.methods.agent.session.resume, {
        sessionId,
        cwd: this.workspacePath,
        mcpServers: configuration ? [configuration.server] : [],
      })
      const [response] = await Promise.all([
        request,
        binding?.attachment.ready ?? Promise.resolve(),
      ])
      return response
    }
    if (configuration && configuration.wireVersion !== 2) throw wrongMcpWireVersion()
    const request = protocol.context.request(acpV2.methods.agent.session.resume, {
      sessionId,
      cwd: this.workspacePath,
      mcpServers: configuration ? [configuration.server] : [],
    })
    const [response] = await Promise.all([request, binding?.attachment.ready ?? Promise.resolve()])
    return response
  }

  private applyConfiguration(
    options: Pick<SendMessageOptions, 'model' | 'permissionMode'>,
  ): Promise<void> | undefined {
    const protocol = this.connection.protocol
    const sessionId = this.requireSessionId()
    return this.configuration.apply(options, {
      setMode: async (modeId) => {
        if (protocol.wireVersion !== 1) {
          throw new ConversationRuntimeError(
            'invalidConfiguration',
            'ACP V2 mode changes require a session configuration option',
          )
        }
        await protocol.context.request(acpV1.methods.agent.session.setMode, { sessionId, modeId })
      },
      setConfigOption: async (configId, value) => {
        if (protocol.wireVersion === 1) {
          return protocol.context.request(acpV1.methods.agent.session.setConfigOption, {
            sessionId,
            configId,
            value,
          })
        }
        return protocol.context.request(acpV2.methods.agent.session.setConfigOption, {
          sessionId,
          configId,
          type: 'id',
          value,
        })
      },
    })
  }

  private validateRestoringUpdate(input: AcpSessionUpdateNotification): void {
    if (this.replayCollector) {
      this.replayCollector.accept(input)
      return
    }
    if (input.wireVersion !== this.connection.protocol.wireVersion) {
      throw new ConversationRuntimeError(
        'invalidState',
        'ACP restore update used the wrong wire version',
      )
    }
    if (input.notification.sessionId !== this.requireSessionId()) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP restore update belongs to an unknown session: ${input.notification.sessionId}`,
      )
    }
    if (!isPassiveUpdate(input)) {
      throw new ConversationRuntimeError(
        'invalidState',
        'ACP session/resume returned unexpected conversation replay',
      )
    }
  }

  private finishOperation(
    operation: AcpTurnOperation,
    terminal: Extract<ConversationEventKind, { type: 'runFinished' | 'runFailed' }>,
  ): void {
    if (this.activeOperation !== operation || !operation.complete()) return
    this.activeOperation = null
    this.permissions.cancelAll()
    this.emitKind(terminal)
  }

  private failOperation(operation: AcpTurnOperation, cause: unknown): void {
    this.finishOperation(operation, { type: 'runFailed', failure: failureFrom(cause) })
  }

  private failActiveOperation(cause: unknown): void {
    if (this.activeOperation) this.failOperation(this.activeOperation, cause)
  }

  private validateUpdateOwner(input: AcpSessionUpdateNotification): void {
    if (input.wireVersion !== this.connection.protocol.wireVersion) {
      throw new ConversationRuntimeError('invalidState', 'ACP update used the wrong wire version')
    }
    const sessionId = input.notification.sessionId
    if (sessionId !== this.requireSessionId()) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP update belongs to an unknown session: ${sessionId}`,
      )
    }
  }

  private validatePermissionOwner(input: AcpPermissionRequest): void {
    if (input.wireVersion !== this.connection.protocol.wireVersion) {
      throw new ConversationRuntimeError(
        'invalidState',
        'ACP permission used the wrong wire version',
      )
    }
    if (input.request.sessionId !== this.requireSessionId()) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP permission belongs to an unknown session: ${input.request.sessionId}`,
      )
    }
  }

  private notifyCancellation(): Promise<void> {
    const sessionId = this.requireSessionId()
    return this.connection.protocol.wireVersion === 1
      ? this.connection.protocol.context.notify(acpV1.methods.agent.session.cancel, { sessionId })
      : this.connection.protocol.context.notify(acpV2.methods.agent.session.cancel, { sessionId })
  }

  private async shutdownOnce(): Promise<void> {
    if (this.lifecycle === 'closed') return
    const wasActive = this.lifecycle === 'active'
    this.lifecycle = 'closing'
    if (wasActive && this.activeOperation) {
      const operation = this.activeOperation
      void this.notifyCancellation().catch(() => undefined)
      this.finishOperation(operation, {
        type: 'runFailed',
        failure: { code: 'cancelled', retryable: false },
      })
    }
    this.permissions.cancelAll()
    if (wasActive && this.sessionId && this.connection.protocol.initialization.supportsCloseSession)
      this.requestSessionClose(this.sessionId)
    await this.closeResources()
    this.lifecycle = 'closed'
  }

  private requestSessionClose(sessionId: string): void {
    const request =
      this.connection.protocol.wireVersion === 1
        ? this.connection.protocol.context.request(acpV1.methods.agent.session.close, { sessionId })
        : this.connection.protocol.context.request(acpV2.methods.agent.session.close, { sessionId })
    void request.catch(() => undefined)
  }

  private handleConnectionClosed(cause?: unknown): void {
    if (this.lifecycle === 'closing' || this.lifecycle === 'closed' || this.lifecycle === 'failed')
      return
    this.lifecycle = 'failed'
    this.restoreFailure ??= cause ?? new Error('ACP Agent connection closed')
    this.permissions.cancelAll()
    this.failActiveOperation(cause ?? new Error('ACP Agent connection closed'))
    void this.mcpBinding?.attachment.close().catch(() => undefined)
  }

  private handleAttachmentClosed(cause?: unknown): void {
    if (this.lifecycle === 'closing' || this.lifecycle === 'closed' || this.lifecycle === 'failed')
      return
    const failure =
      cause ?? new ConversationRuntimeError('connectionFailed', 'ACP MCP attachment closed', true)
    this.lifecycle = 'failed'
    this.restoreFailure ??= failure
    this.permissions.cancelAll()
    this.failActiveOperation(failure)
    void this.connection.close().catch(() => undefined)
  }

  private closeResources(): Promise<void> {
    this.resourceClosePromise ??= this.closeResourcesOnce()
    return this.resourceClosePromise
  }

  private async closeResourcesOnce(): Promise<void> {
    const results = await Promise.allSettled([
      this.connection.close(),
      this.mcpBinding?.attachment.close(),
    ])
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (failures.length > 0) throw new AggregateError(failures, 'ACP session shutdown failed')
  }

  private emitKind(event: ConversationEventKind): void {
    const incoming = { conversationId: this.conversationId, sequence: ++this.sequence, event }
    const current = this.turns.at(-1)
    if (current) {
      this.turns[this.turns.length - 1] = reduceConversationTurn(current, incoming)
    }
    this.emit(incoming)
  }

  private requireSessionId(): string {
    if (!this.sessionId) {
      throw new ConversationRuntimeError('invalidState', 'ACP session has not been created')
    }
    return this.sessionId
  }

  private assertActive(): void {
    if (this.lifecycle !== 'active') {
      throw new ConversationRuntimeError(
        this.lifecycle === 'closing' || this.lifecycle === 'closed' ? 'shutDown' : 'invalidState',
        `ACP session is not active: ${this.conversationId}`,
      )
    }
  }
}

function preserveDeleteError(primary: unknown, cleanup: unknown): unknown {
  if (primary instanceof ConversationRuntimeError) {
    return new ConversationRuntimeError(primary.code, primary.message, primary.retryable, {
      cause: new AggregateError([primary, cleanup], 'ACP session deletion cleanup failed'),
    })
  }
  return new AggregateError([primary, cleanup], 'ACP session deletion cleanup failed')
}

function wrongMcpWireVersion(): ConversationRuntimeError {
  return new ConversationRuntimeError(
    'invalidConfiguration',
    'ACP MCP configuration used the wrong wire version',
  )
}

function wrongRestoreWireVersion(): ConversationRuntimeError {
  return new ConversationRuntimeError('invalidState', 'ACP session/load requires wire version 1')
}

async function withRestoreTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  conversationId: string,
  scheduler: AcpSessionScheduler,
): Promise<T> {
  let timer: unknown
  const timeout = new Promise<never>((_resolve, reject) => {
    const handle = scheduler.setTimeout(
      () =>
        reject(
          new ConversationRuntimeError(
            'connectionFailed',
            `ACP session restore timed out: ${conversationId}`,
            true,
          ),
        ),
      timeoutMs,
    )
    timer = handle
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== undefined) scheduler.clearTimeout(timer)
  }
}

function failureFrom(cause: unknown): ConversationFailure {
  if (cause instanceof AcpHostError) {
    return { code: 'transport', message: cause.message, retryable: cause.retryable }
  }
  if (cause instanceof ConversationRuntimeError) {
    return { code: 'transport', message: cause.message, retryable: cause.retryable }
  }
  return {
    code: 'transport',
    message: cause instanceof Error ? cause.message : 'ACP Agent operation failed',
    retryable: true,
  }
}

function isPassiveUpdate(input: AcpSessionUpdateNotification): boolean {
  const kind = input.notification.update.sessionUpdate
  return (
    kind === 'available_commands_update' ||
    kind === 'current_mode_update' ||
    kind === 'config_option_update' ||
    kind === 'session_info_update' ||
    kind === 'usage_update' ||
    kind === 'compaction_update' ||
    kind === 'compaction_summary_chunk'
  )
}
