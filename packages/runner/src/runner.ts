import { chmod, lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import type { AcpRunnerAgent } from './acp.js'
import { defaultAcpRunnerAgents } from './defaults.js'
import { createNoopRunnerLogger, type RunnerLogger, type RunnerLogFields } from './logger.js'
import {
  isRunnerEnvelope,
  RUNNER_PROTOCOL_VERSION,
  type HostHello,
  type RunnerAttached,
  type RunnerAttach,
  type RunnerCommand,
  type RunnerConfigUpdate,
  type RunnerEnvelope,
  type RunnerEvent,
  type RunnerError,
  type RunnerHeartbeat,
  type RunnerProviderLeaseRequest,
  type RunnerProviderLeaseResponse,
  type RunnerPermissionDecision,
  type RunnerResume,
} from './protocol.js'

const DEFAULT_LIMIT = 5
const DEFAULT_WORKSPACE_ROOT = path.join(os.tmpdir(), 'tea-runner')
const DEFAULT_STATE_ROOT = path.join(os.tmpdir(), 'tea-runner-state')

export interface RunnerEntry {
  localKey: string
  token: string
  displayName: string
  tags: string[]
  runnerId?: string
  limit?: number
}

/** A single TOML file can describe many logical runners on one host. */
export interface RunnerConfig {
  centerUrl: string
  workspaceRoot?: string
  stateDir?: string
  concurrent?: number
  runners: readonly RunnerEntry[]
  agents?: readonly AcpRunnerAgent[]
}

export interface RunnerConfigFile extends RunnerConfig {
  workspaceRoot: string
  stateDir: string
  runners: readonly RunnerEntry[]
  agents: readonly AcpRunnerAgent[]
}

export type RunnerExecutorCommand = RunnerCommand & {
  conversationId: string
  workspacePath: string
  /** Resolved in memory from Center; never serialized to the runner protocol. */
  provider?: RunnerProviderConfiguration
}

export type RunnerProviderConfiguration = RunnerProviderLeaseResponse

export interface AgentExecutor {
  start(command: RunnerExecutorCommand): Promise<void>
  prompt(
    command: RunnerExecutorCommand,
    emit?: (event: RunnerEvent) => void | Promise<void>,
  ): Promise<RunnerEvent>
  cancel(command: RunnerExecutorCommand): Promise<void>
  resolvePermission?(
    conversationId: string,
    approvalId: string,
    decision: RunnerPermissionDecision,
  ): Promise<void> | void
  shutdown?(): Promise<void>
}

export class EchoAgentExecutor implements AgentExecutor {
  async start(): Promise<void> {}

  async prompt(command: RunnerExecutorCommand): Promise<RunnerEvent> {
    return {
      eventType: 'assistant.message',
      data: { text: `echo: ${command.text ?? ''}` },
      terminal: true,
    }
  }

  async cancel(): Promise<void> {}
}

export async function loadRunnerConfig(filePath: string): Promise<RunnerConfigFile> {
  requireTomlPath(filePath)
  await validateConfigFile(filePath)
  const source = await readFile(filePath, 'utf8')
  return normalizeConfig(parseToml(source))
}

export async function saveRunnerConfig(filePath: string, config: RunnerConfig): Promise<void> {
  requireTomlPath(filePath)
  const normalized = normalizeConfig(config)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const encoded = `${stringifyToml(toTomlConfig(normalized))}\n`
  try {
    await writeFile(temporary, encoded, { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, filePath)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

export function runnerEntries(config: RunnerConfig): RunnerEntry[] {
  return [...normalizeConfig(config).runners]
}

export function applyRunnerConfigUpdate(
  config: RunnerConfig,
  update: RunnerConfigUpdate,
): RunnerConfigFile {
  const normalized = normalizeConfig(config)
  const entries = runnerEntries(normalized).map((entry) => ({ ...entry, tags: [...entry.tags] }))
  const target = entries.find((entry) => entry.localKey === update.localKey)
  if (!target) throw new Error(`runner config entry not found: ${update.localKey}`)
  if (update.limit !== undefined) target.limit = readLimit(update.limit, 'limit')
  if (update.tags !== undefined) target.tags = readTags(update.tags)
  return {
    ...normalized,
    ...(update.concurrent === undefined
      ? {}
      : { concurrent: readLimit(update.concurrent, 'concurrent') }),
    runners: entries,
  }
}

export interface RunnerClientOptions {
  WebSocket?: typeof WebSocket
  executor?: AgentExecutor
  scheduler?: RunnerScheduler
  reconnectDelayMs?: number
  heartbeatIntervalMs?: number
  commandHistoryLimit?: number
  spoolRetryDelayMs?: number
  configPath?: string
  hostId?: string
  logger?: RunnerLogger
  onRegistered?: (registration: RunnerAttached) => void
  onError?: (error: Error) => void
  fetch?: typeof fetch
}

export interface RunnerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

interface SpoolRecord {
  localKey: string
  envelope: RunnerEnvelope<RunnerEvent>
}

interface AttachmentBarrier {
  socket: WebSocket
  pending: Set<string>
  attached: Set<string>
  requests: Map<string, string>
  onlyPermanentFailures: boolean
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
}

const DEFAULT_SCHEDULER: RunnerScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class TeaRunner {
  private readonly executor: AgentExecutor
  private readonly socketFactory: typeof WebSocket
  private readonly scheduler: RunnerScheduler
  private readonly heartbeatIntervalMs: number
  private readonly reconnectDelayMs: number
  private readonly commandHistoryLimit: number
  private readonly spoolRetryDelayMs: number
  private readonly configPath?: string
  private readonly hostId: string
  private readonly logger: RunnerLogger
  private readonly fetcher: typeof fetch
  private socket: WebSocket | null = null
  private stopped = false
  private stopping = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: unknown = null
  private socketReadyForEvents = false
  private attachmentBarrier: AttachmentBarrier | null = null
  private configValue: RunnerConfigFile
  private readonly registrations = new Map<string, RunnerAttached>()
  private readonly entries = new Map<string, RunnerEntry>()
  private readonly permanentlyFailedAttachments = new Set<string>()
  private readonly sequenceByConversation = new Map<string, number>()
  private readonly workspaces = new Map<string, string>()
  private readonly activeConversations = new Map<string, string>()
  private readonly failedConversations = new Set<string>()
  private readonly commandChains = new Map<string, Promise<void>>()
  private readonly processedCommands = new Map<string, Promise<void>>()
  private readonly reportedErrors = new WeakSet<Error>()
  private reconnectBlocked = false
  private readonly spoolByMessageId = new Map<string, string>()
  private readonly idleWaiters = new Set<() => void>()
  private sendChain: Promise<void> = Promise.resolve()
  private configUpdateChain: Promise<void> = Promise.resolve()

  constructor(config: RunnerConfig, options: RunnerClientOptions = {}) {
    this.configValue = normalizeConfig(config)
    this.executor = options.executor ?? new EchoAgentExecutor()
    this.socketFactory = options.WebSocket ?? WebSocket
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000
    this.commandHistoryLimit = readLimit(
      options.commandHistoryLimit ?? 1024,
      'command history limit',
    )
    if (
      options.spoolRetryDelayMs !== undefined &&
      (!Number.isSafeInteger(options.spoolRetryDelayMs) || options.spoolRetryDelayMs < 0)
    ) {
      throw new Error('spool retry delay must be a non-negative integer')
    }
    this.spoolRetryDelayMs = options.spoolRetryDelayMs ?? 1_000
    this.configPath = options.configPath
    this.hostId = options.hostId?.trim() || `${os.hostname()}-${randomUUID()}`
    this.logger = options.logger ?? createNoopRunnerLogger()
    this.fetcher = options.fetch ?? fetch
    this.onRegistered = options.onRegistered
    this.onError = options.onError
    for (const entry of runnerEntries(this.configValue)) this.entries.set(entry.localKey, entry)
  }

  private readonly onRegistered?: (registration: RunnerAttached) => void
  private readonly onError?: (error: Error) => void

  async start(): Promise<void> {
    this.stopped = false
    this.stopping = false
    this.logger.info('runner starting', {
      centerUrl: this.configValue.centerUrl,
      runnerCount: this.entries.size,
      hostId: this.hostId,
    })
    try {
      await this.connect()
    } catch (error) {
      if (!this.stopped && !this.stopping) this.report(toError(error))
    }
  }

  /** Graceful stop waits indefinitely for active ACP tasks unless forced. */
  async stop(options: { force?: boolean } = {}): Promise<void> {
    this.stopping = true
    this.logger.info('runner stopping', {
      force: Boolean(options.force),
      activeConversations: this.activeConversations.size,
    })
    if (!options.force) await this.waitForIdle()
    this.stopped = true
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    if (this.reconnectTimer !== null) this.scheduler.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    if (options.force) this.activeConversations.clear()
    await this.executor.shutdown?.()
    await Promise.allSettled(this.commandChains.values())
    await this.configUpdateChain.catch(() => undefined)
    this.commandChains.clear()
    this.processedCommands.clear()
    this.failedConversations.clear()
    this.registrations.clear()
    this.logger.info('runner stopped')
  }

  getRegistration(): RunnerAttached | null {
    return this.registrations.values().next().value ?? null
  }

  getRegistrations(): RunnerAttached[] {
    return [...this.registrations.values()]
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.stopping) return
    const url =
      this.configValue.centerUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/v1/runner/connect'
    this.logger.info('connecting to Center', { url })
    const socket = new this.socketFactory(url)
    this.socket = socket
    this.socketReadyForEvents = false
    try {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          socket.off('error', onError)
          this.logger.info('Center WebSocket connected')
          resolve()
        }
        const onError = (error: Error) => {
          socket.off('open', onOpen)
          reject(error)
        }
        socket.once('open', onOpen)
        socket.once('error', onError)
      })
    } catch (error) {
      this.failConnection(socket)
      throw error
    }
    try {
      socket.on('message', (raw) => {
        void this.handleMessage(socket, raw.toString()).catch((error: unknown) =>
          this.report(toError(error)),
        )
      })
      socket.on('close', (code: number) => this.handleClose(socket, code))
      socket.on('error', (error) => this.report(error))

      const attachmentReady = this.prepareAttachmentBarrier(socket)
      const hello: HostHello = { hostId: this.hostId, clientVersion: '0.1.0' }
      await this.send({
        version: RUNNER_PROTOCOL_VERSION,
        messageId: randomUUID(),
        type: 'host.hello',
        payload: hello,
      })
      for (const entry of this.entries.values()) {
        if (this.permanentlyFailedAttachments.has(entry.localKey)) continue
        const attach: RunnerAttach = {
          ...entry,
          tags: [...entry.tags],
          workspaceRoot: this.configValue.workspaceRoot,
          limit: entry.limit ?? DEFAULT_LIMIT,
        }
        const messageId = randomUUID()
        this.trackAttachment(socket, messageId, entry.localKey)
        await this.send({
          version: RUNNER_PROTOCOL_VERSION,
          messageId,
          type: 'runner.attach',
          localKey: entry.localKey,
          payload: attach,
        })
      }
      this.logger.debug('runner attachments sent', { runnerCount: this.entries.size })
      await attachmentReady
      if (this.socket !== socket) throw new Error('runner WebSocket was replaced during attachment')
      this.socketReadyForEvents = true
      await this.sendResume()
      await this.replaySpool()
      this.logger.info('runner connection ready', { runnerCount: this.registrations.size })
    } catch (error) {
      this.failConnection(socket)
      throw error
    }
  }

  private handleClose(socket: WebSocket, code?: number): void {
    if (this.socket !== socket) return
    this.logger.warn('Center WebSocket closed', { code })
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.socket = null
    this.socketReadyForEvents = false
    const barrier = this.attachmentBarrier
    if (barrier?.socket === socket) {
      this.attachmentBarrier = null
      barrier.reject(new Error('runner WebSocket closed during attachment'))
    }
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.stopping || this.reconnectBlocked || this.reconnectTimer !== null)
      return
    this.logger.info('scheduling Center reconnect', { delayMs: this.reconnectDelayMs })
    this.reconnectTimer = this.scheduler.setTimeout(() => {
      this.reconnectTimer = null
      void this.connect().catch((error: unknown) => this.report(toError(error)))
    }, this.reconnectDelayMs)
  }

  private failConnection(socket: WebSocket): void {
    if (this.socket !== socket) {
      socket.close()
      return
    }
    this.socket = null
    this.socketReadyForEvents = false
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    const barrier = this.attachmentBarrier
    if (barrier?.socket === socket) {
      this.attachmentBarrier = null
      barrier.reject(new Error('runner WebSocket closed during attachment'))
    }
    this.scheduleReconnect()
    socket.close()
  }

  private async handleMessage(socket: WebSocket, encoded: string): Promise<void> {
    let value: unknown
    try {
      value = JSON.parse(encoded)
    } catch {
      this.report(new Error('runner received invalid JSON'))
      return
    }
    if (!isRunnerEnvelope(value)) {
      this.report(new Error('runner received invalid envelope'))
      return
    }
    if (value.type === 'runner.attached') {
      const registration = readAttached(value.payload, value.localKey)
      const localKey =
        registration.localKey || value.localKey || this.findLocalKey(registration.runnerId)
      if (!localKey) throw new Error('runner attachment omitted localKey')
      this.registrations.set(localKey, registration)
      this.logger.info('runner attached', {
        localKey,
        runnerId: registration.runnerId,
        instanceId: registration.instanceId,
      })
      this.onRegistered?.(registration)
      const barrier = this.attachmentBarrier
      if (barrier?.socket === socket) {
        barrier.attached.add(localKey)
        this.removePendingAttachment(barrier, localKey, value.correlationId)
        if (barrier.pending.size === 0) {
          this.finishAttachmentBarrier(barrier)
        }
      }
      if (!this.heartbeatTimer)
        this.heartbeatTimer = setInterval(() => this.sendHeartbeats(), this.heartbeatIntervalMs)
      return
    }
    if (value.type === 'runner.command') {
      const payload = isRecord(value.payload) ? value.payload : undefined
      this.logger.debug('runner command received', {
        command: payload && typeof payload.command === 'string' ? payload.command : 'unknown',
        conversationId: value.conversationId,
        ...(payload && typeof payload.runtimeId === 'string'
          ? { runtimeId: payload.runtimeId }
          : {}),
        ...(payload && typeof payload.providerId === 'string'
          ? { providerId: payload.providerId }
          : {}),
        ...(payload && typeof payload.modelId === 'string' ? { modelId: payload.modelId } : {}),
      })
      this.enqueueCommand(value as RunnerEnvelope<RunnerCommand>)
      return
    }
    if (value.type === 'runner.event.ack') {
      const eventId = value.correlationId ?? value.messageId.replace(/-ack$/, '')
      const spoolPath = this.spoolByMessageId.get(eventId)
      this.spoolByMessageId.delete(eventId)
      if (spoolPath) await unlink(spoolPath).catch(() => undefined)
      return
    }
    if (value.type === 'runner.config.update') {
      const update = value.payload
      if (!update || typeof update !== 'object') throw new Error('runner config update is invalid')
      const requested = update as RunnerConfigUpdate
      this.configUpdateChain = this.configUpdateChain
        .catch(() => undefined)
        .then(async () => {
          this.logger.info('applying runner configuration update', {
            localKey: requested.localKey,
            hasLimit: requested.limit !== undefined,
            hasTags: requested.tags !== undefined,
            hasConcurrent: requested.concurrent !== undefined,
          })
          const next = applyRunnerConfigUpdate(this.configValue, requested)
          if (this.configPath) await saveRunnerConfig(this.configPath, next)
          this.configValue = next
          this.entries.clear()
          for (const entry of runnerEntries(next)) this.entries.set(entry.localKey, entry)
          this.logger.info('runner configuration updated', { runnerCount: this.entries.size })
        })
        .catch((error: unknown) => {
          this.logger.error('runner configuration update failed', { error: toError(error).message })
          throw error
        })
      await this.configUpdateChain
      return
    }
    if (value.type === 'runner.error') {
      const payload = isRecord(value.payload) ? (value.payload as Partial<RunnerError>) : {}
      const code = typeof payload.code === 'string' ? payload.code : undefined
      const message =
        typeof payload.message === 'string' && payload.message.trim()
          ? payload.message
          : 'runner protocol error'
      const error = new Error(message)
      const barrier = this.attachmentBarrier
      let resolvedLocalKey: string | undefined
      let wasPermanentlyFailed = false
      if (barrier?.socket === socket) {
        resolvedLocalKey = this.removePendingAttachment(
          barrier,
          value.localKey,
          value.correlationId,
        )
        if (resolvedLocalKey) this.registrations.delete(resolvedLocalKey)
        barrier.onlyPermanentFailures = barrier.onlyPermanentFailures && code === 'invalid_token'
        if (code === 'invalid_token' && resolvedLocalKey) {
          wasPermanentlyFailed = this.permanentlyFailedAttachments.has(resolvedLocalKey)
          this.permanentlyFailedAttachments.add(resolvedLocalKey)
        }
        if (barrier.pending.size === 0) {
          this.finishAttachmentBarrier(barrier, error)
        }
      }
      const shouldReport =
        code !== 'invalid_token' || resolvedLocalKey === undefined || !wasPermanentlyFailed
      if (shouldReport) {
        this.report(error, {
          code,
          localKey: value.localKey,
          correlationId: value.correlationId,
        })
      }
    }
  }

  private prepareAttachmentBarrier(socket: WebSocket): Promise<void> {
    // Registrations are scoped to one WebSocket attachment session. Active
    // conversations keep their local keys and can be rebound after reconnect.
    this.registrations.clear()
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = (error: unknown) => rej(toError(error))
    })
    this.attachmentBarrier = {
      socket,
      pending: new Set(
        [...this.entries.keys()].filter(
          (localKey) => !this.permanentlyFailedAttachments.has(localKey),
        ),
      ),
      attached: new Set(),
      requests: new Map(),
      onlyPermanentFailures: true,
      promise,
      resolve,
      reject,
    }
    if (this.attachmentBarrier.pending.size === 0) resolve()
    return promise
  }

  private trackAttachment(socket: WebSocket, messageId: string, localKey: string): void {
    const barrier = this.attachmentBarrier
    if (barrier?.socket === socket) barrier.requests.set(messageId, localKey)
  }

  private removePendingAttachment(
    barrier: AttachmentBarrier,
    localKey: string | undefined,
    correlationId: string | undefined,
  ): string | undefined {
    const correlatedLocalKey = correlationId ? barrier.requests.get(correlationId) : undefined
    if (correlationId) barrier.requests.delete(correlationId)
    const resolvedLocalKey = localKey ?? correlatedLocalKey ?? barrier.pending.values().next().value
    if (resolvedLocalKey !== undefined) barrier.pending.delete(resolvedLocalKey)
    return resolvedLocalKey
  }

  private finishAttachmentBarrier(barrier: AttachmentBarrier, failure?: Error): void {
    if (this.attachmentBarrier?.socket !== barrier.socket) return
    this.attachmentBarrier = null
    if (barrier.attached.size > 0) {
      barrier.resolve()
      return
    }
    if (barrier.onlyPermanentFailures) this.reconnectBlocked = true
    barrier.reject(failure ?? new Error('all runner attachments were rejected'))
    this.socketReadyForEvents = false
    barrier.socket.close()
  }

  private enqueueCommand(envelope: RunnerEnvelope<RunnerCommand>): void {
    if (
      this.stopping ||
      !envelope.messageId ||
      this.processedCommands.has(envelope.messageId) ||
      !envelope.conversationId
    )
      return
    const permissionResolve =
      isRecord(envelope.payload) && envelope.payload.command === 'conversation.permission.resolve'
    // A permission response must be handled while the prompt is awaiting ACP.
    // Putting it behind the conversation chain would deadlock that prompt.
    const previous = this.commandChains.get(envelope.conversationId) ?? Promise.resolve()
    const current = permissionResolve
      ? this.handleCommand(envelope).catch((error: unknown) => this.report(toError(error)))
      : previous
          .catch(() => undefined)
          .then(() => this.handleCommand(envelope))
          .catch((error: unknown) => this.report(toError(error)))
    if (!permissionResolve) this.commandChains.set(envelope.conversationId, current)
    this.processedCommands.set(envelope.messageId, current)
    while (this.processedCommands.size > this.commandHistoryLimit) {
      const oldest = this.processedCommands.keys().next().value
      if (oldest === undefined) break
      this.processedCommands.delete(oldest)
    }
    if (!permissionResolve) {
      void current.finally(() => {
        if (this.commandChains.get(envelope.conversationId!) === current)
          this.commandChains.delete(envelope.conversationId!)
      })
    }
  }

  private async handleCommand(envelope: RunnerEnvelope<RunnerCommand>): Promise<void> {
    const localKey =
      envelope.localKey ??
      this.findLocalKey(envelope.runnerId) ??
      (this.registrations.size === 1 ? this.registrations.keys().next().value : undefined)
    const registration = localKey ? this.registrations.get(localKey) : undefined
    if (!localKey || !registration || !envelope.conversationId) {
      this.logger.warn('runner command ignored because assignment is unavailable', {
        conversationId: envelope.conversationId,
      })
      return
    }
    if (
      (envelope.runnerId !== undefined && envelope.runnerId !== registration.runnerId) ||
      (envelope.instanceId !== undefined && envelope.instanceId !== registration.instanceId) ||
      (envelope.attachmentId !== undefined &&
        envelope.attachmentId !== registration.attachmentId) ||
      (envelope.assignmentEpoch !== undefined && envelope.assignmentEpoch !== registration.epoch)
    ) {
      this.logger.warn('runner command rejected as stale assignment', {
        localKey,
        conversationId: envelope.conversationId,
      })
      await this.sendError(envelope, 'stale_assignment', 'runner assignment is stale')
      return
    }
    const command = envelope.payload
    if (!command || typeof command !== 'object' || !isRunnerCommand(command)) {
      this.logger.warn('runner command rejected as invalid')
      await this.sendError(envelope, 'invalid_command', 'runner command is invalid')
      return
    }
    try {
      if (
        command.command === 'conversation.start' &&
        command.runtimeId.startsWith('external.') &&
        command.modelId.trim() !== '' &&
        command.modelId !== 'default' &&
        !command.leaseToken?.trim()
      ) {
        throw new Error('provider lease is missing for the selected model')
      }
      if (command.command === 'conversation.permission.resolve') {
        if (!command.approvalId?.trim() || !command.decision) {
          throw new Error('permission resolution is invalid')
        }
        if (!this.executor.resolvePermission) {
          throw new Error('runner executor does not support permission resolution')
        }
        await this.executor.resolvePermission(
          envelope.conversationId,
          command.approvalId,
          command.decision,
        )
        this.logger.info('conversation permission resolved', {
          localKey,
          conversationId: envelope.conversationId,
          approvalId: command.approvalId,
          decision: command.decision,
        })
        return
      }
      const workspacePath = await this.workspacePath(localKey, envelope.conversationId)
      const provider = await this.resolveProviderLease(localKey, command)
      const commandWithPath = {
        ...command,
        conversationId: envelope.conversationId,
        workspacePath,
        ...(provider ? { provider } : {}),
      }
      if (command.command === 'conversation.start') {
        this.failedConversations.delete(envelope.conversationId)
        this.logger.info('conversation execution started', {
          localKey,
          conversationId: envelope.conversationId,
          command: command.command,
        })
        await this.executor.start(commandWithPath)
        this.activeConversations.set(envelope.conversationId, localKey)
        await this.sendEvent(envelope, { eventType: 'conversation.started' }, localKey)
      } else if (command.command === 'conversation.cancel') {
        this.logger.info('conversation cancellation requested', {
          localKey,
          conversationId: envelope.conversationId,
        })
        await this.executor.cancel(commandWithPath)
        this.activeConversations.delete(envelope.conversationId)
        await this.sendEvent(
          envelope,
          { eventType: 'conversation.cancelled', terminal: true },
          localKey,
        )
        this.resolveIdleWaiters()
      } else {
        if (this.failedConversations.has(envelope.conversationId)) {
          this.logger.debug('conversation prompt ignored after failed start', {
            localKey,
            conversationId: envelope.conversationId,
          })
          return
        }
        this.logger.info('conversation prompt execution started', {
          localKey,
          conversationId: envelope.conversationId,
          command: command.command,
        })
        const event = await this.executor.prompt(commandWithPath, (streamed) =>
          this.sendEvent(envelope, streamed, localKey),
        )
        await this.sendEvent(envelope, event, localKey)
        if (event.terminal) {
          this.activeConversations.delete(envelope.conversationId)
          this.resolveIdleWaiters()
        }
        this.logger.info('conversation prompt execution completed', {
          localKey,
          conversationId: envelope.conversationId,
          terminal: Boolean(event.terminal),
        })
      }
    } catch (error) {
      this.logger.error('conversation execution failed', {
        localKey,
        conversationId: envelope.conversationId,
        command: command.command,
        runtimeId: command.runtimeId,
        providerId: command.providerId,
        modelId: command.modelId,
        error: toError(error).message,
      })
      if (command.command === 'conversation.start') {
        this.failedConversations.add(envelope.conversationId)
      }
      await this.sendEvent(
        envelope,
        {
          eventType: 'conversation.failed',
          terminal: true,
          errorCode: 'runner_execution_failed',
          error: error instanceof Error ? error.message : String(error),
        },
        localKey,
      )
      this.activeConversations.delete(envelope.conversationId)
      this.resolveIdleWaiters()
    }
  }

  private async resolveProviderLease(
    localKey: string,
    command: RunnerCommand,
  ): Promise<RunnerProviderConfiguration | undefined> {
    if (command.command !== 'conversation.start' || !command.leaseToken) return undefined
    const entry = this.entries.get(localKey)
    if (!entry) throw new Error('runner registration is unavailable')
    const endpoint = providerLeaseEndpoint(this.configValue.centerUrl)
    const request: RunnerProviderLeaseRequest = {
      leaseToken: command.leaseToken,
      runtimeId: command.runtimeId,
      providerId: command.providerId,
      modelId: command.modelId,
    }
    let response: Response
    try {
      response = await this.fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${entry.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    } catch {
      throw new Error('provider lease could not be fetched from Center')
    }
    if (!response.ok) throw new Error(`provider lease request failed (${response.status})`)
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new Error('provider lease response is invalid')
    }
    return readProviderLeaseResponse(value, request)
  }

  private async workspacePath(localKey: string, conversationId: string): Promise<string> {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(localKey) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(conversationId)
    )
      throw new Error('workspace identity is invalid')
    const key = `${localKey}:${conversationId}`
    const existing = this.workspaces.get(key)
    if (existing) return existing
    const workspace = path.join(this.configValue.workspaceRoot, localKey, conversationId)
    await mkdir(workspace, { recursive: true, mode: 0o700 })
    this.workspaces.set(key, workspace)
    return workspace
  }

  private async sendEvent(
    envelope: RunnerEnvelope,
    event: RunnerEvent,
    localKey: string,
  ): Promise<void> {
    if (!envelope.conversationId) throw new Error('runner event conversation id is required')
    const key = `${localKey}:${envelope.conversationId}`
    const sequence = (this.sequenceByConversation.get(key) ?? 0) + 1
    this.sequenceByConversation.set(key, sequence)
    const registration = this.registrations.get(localKey)
    const outbound: RunnerEnvelope<RunnerEvent> = {
      version: RUNNER_PROTOCOL_VERSION,
      messageId: randomUUID(),
      type: 'runner.event',
      runnerId: registration?.runnerId,
      localKey,
      instanceId: registration?.instanceId,
      attachmentId: registration?.attachmentId,
      conversationId: envelope.conversationId,
      assignmentId: envelope.assignmentId,
      assignmentEpoch: registration?.epoch,
      sequence,
      payload: event,
    }
    const spoolPath = await this.writeSpool({ localKey, envelope: outbound })
    this.spoolByMessageId.set(outbound.messageId, spoolPath)
    if (!this.socketReadyForEvents) return
    try {
      await this.send(outbound)
    } catch (error) {
      this.report(toError(error))
    }
  }

  private async writeSpool(record: SpoolRecord): Promise<string> {
    const conversationId = record.envelope.conversationId
    if (!conversationId) throw new Error('spool conversation id is required')
    const directory = path.join(
      this.configValue.stateDir ?? DEFAULT_STATE_ROOT,
      'spool',
      record.localKey,
      conversationId,
    )
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const filePath = path.join(
      directory,
      `${String(record.envelope.sequence).padStart(12, '0')}-${record.envelope.messageId}.json`,
    )
    const temporary = `${filePath}.${process.pid}.tmp`
    while (true) {
      try {
        await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 })
        await rename(temporary, filePath)
        return filePath
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        const code =
          error && typeof error === 'object' && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined
        if (code !== 'ENOSPC' && code !== 'EDQUOT') throw error
        await new Promise<void>((resolve) => setTimeout(resolve, this.spoolRetryDelayMs))
      }
    }
  }

  private async replaySpool(): Promise<void> {
    const root = path.join(this.configValue.stateDir ?? DEFAULT_STATE_ROOT, 'spool')
    const localKeys = await readdir(root, { withFileTypes: true }).catch(() => [])
    let replayed = 0
    for (const local of localKeys) {
      if (!local.isDirectory()) continue
      const conversations = await readdir(path.join(root, local.name), {
        withFileTypes: true,
      }).catch(() => [])
      for (const conversation of conversations) {
        if (!conversation.isDirectory()) continue
        const files = await readdir(path.join(root, local.name, conversation.name))
        for (const file of files.sort()) {
          if (!file.endsWith('.json')) continue
          const filePath = path.join(root, local.name, conversation.name, file)
          const record = JSON.parse(await readFile(filePath, 'utf8')) as SpoolRecord
          const registration = this.registrations.get(record.localKey)
          if (!registration) continue
          if (!record.envelope.conversationId || !Number.isSafeInteger(record.envelope.sequence)) {
            throw new Error(`runner spool record is invalid: ${filePath}`)
          }
          const sequenceKey = `${record.localKey}:${record.envelope.conversationId}`
          this.sequenceByConversation.set(
            sequenceKey,
            Math.max(
              this.sequenceByConversation.get(sequenceKey) ?? 0,
              record.envelope.sequence ?? 0,
            ),
          )
          const envelope = {
            ...record.envelope,
            runnerId: registration.runnerId,
            localKey: record.localKey,
            instanceId: registration.instanceId,
            attachmentId: registration.attachmentId,
            assignmentEpoch: registration.epoch,
          }
          this.spoolByMessageId.set(envelope.messageId, filePath)
          await this.send(envelope)
          replayed += 1
        }
      }
    }
    if (replayed > 0) this.logger.info('replayed spooled runner events', { count: replayed })
  }

  private async sendResume(): Promise<void> {
    const assignments: RunnerResume['assignments'] = []
    for (const [conversationId, localKey] of this.activeConversations) {
      const registration = this.registrations.get(localKey)
      if (!registration) continue
      assignments.push({
        conversationId,
        assignmentEpoch: registration.epoch,
        lastEventSequence: this.sequenceByConversation.get(`${localKey}:${conversationId}`) ?? 0,
      })
    }
    if (assignments.length === 0) return
    await this.send({
      version: RUNNER_PROTOCOL_VERSION,
      messageId: randomUUID(),
      type: 'runner.resume',
      payload: { assignments } satisfies RunnerResume,
    })
  }

  private sendHeartbeats(): void {
    for (const [localKey, registration] of this.registrations) {
      const active = [...this.activeConversations.values()].filter(
        (value) => value === localKey,
      ).length
      const entry = this.entries.get(localKey)
      const heartbeat: RunnerHeartbeat = {
        activeConversations: active,
        capacity: this.configValue.concurrent ?? this.entries.size,
        limit: entry?.limit ?? DEFAULT_LIMIT,
      }
      void this.send({
        version: RUNNER_PROTOCOL_VERSION,
        messageId: randomUUID(),
        type: 'runner.heartbeat',
        runnerId: registration.runnerId,
        localKey,
        instanceId: registration.instanceId,
        attachmentId: registration.attachmentId,
        payload: heartbeat,
      }).catch((error: unknown) => this.report(toError(error)))
    }
  }

  private async send(envelope: RunnerEnvelope): Promise<void> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN)
      throw new Error('runner WebSocket is not connected')
    const encoded = JSON.stringify(envelope)
    this.sendChain = this.sendChain
      .catch(() => undefined)
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (socket.readyState !== WebSocket.OPEN) {
              reject(new Error('runner WebSocket is not connected'))
              return
            }
            socket.send(encoded, (error?: Error) => (error ? reject(error) : resolve()))
          }),
      )
    return this.sendChain
  }

  private async sendError(envelope: RunnerEnvelope, code: string, message: string): Promise<void> {
    await this.send({
      version: RUNNER_PROTOCOL_VERSION,
      messageId: randomUUID(),
      correlationId: envelope.messageId,
      type: 'runner.error',
      runnerId: envelope.runnerId,
      localKey: envelope.localKey,
      instanceId: envelope.instanceId,
      attachmentId: envelope.attachmentId,
      conversationId: envelope.conversationId,
      assignmentEpoch: envelope.assignmentEpoch,
      payload: { code, message },
    })
  }

  private waitForIdle(): Promise<void> {
    return this.drainUntilIdle()
  }

  private async drainUntilIdle(): Promise<void> {
    while (true) {
      const chains = [...this.commandChains.values()]
      if (chains.length > 0) await Promise.allSettled(chains)
      if (this.activeConversations.size === 0) return
      await new Promise<void>((resolve) => this.idleWaiters.add(resolve))
    }
  }

  private resolveIdleWaiters(): void {
    if (this.activeConversations.size !== 0) return
    for (const resolve of this.idleWaiters) resolve()
    this.idleWaiters.clear()
  }

  private findLocalKey(runnerId: string | undefined): string | undefined {
    if (!runnerId) return undefined
    return [...this.registrations.entries()].find(([, value]) => value.runnerId === runnerId)?.[0]
  }

  private report(error: Error, fields: RunnerLogFields = {}): void {
    if (this.reportedErrors.has(error)) return
    this.reportedErrors.add(error)
    this.logger.error('runner error', { ...fields, error: error.message })
    this.onError?.(error)
  }
}

function normalizeConfig(value: unknown): RunnerConfigFile {
  if (!isRecord(value)) throw new Error('runner config must be an object')
  const centerUrl = readString(value.center_url ?? value.centerUrl, 'center_url')
  const workspaceRoot = readAbsolutePath(
    value.workspace_root ?? value.workspaceRoot,
    DEFAULT_WORKSPACE_ROOT,
  )
  const stateDir =
    value.state_dir === undefined && value.stateDir === undefined
      ? DEFAULT_STATE_ROOT
      : readAbsolutePath(value.state_dir ?? value.stateDir, 'state_dir')
  if (!Array.isArray(value.runners) || value.runners.length === 0) {
    throw new Error('runners must be a non-empty array')
  }
  const runners = value.runners.map((entry, index) => readEntry(entry, index))
  const concurrent =
    value.concurrent === undefined ? undefined : readLimit(value.concurrent, 'concurrent')
  const agents = value.agents === undefined ? defaultAcpRunnerAgents() : readAgents(value.agents)
  return {
    centerUrl,
    workspaceRoot,
    stateDir,
    ...(concurrent === undefined ? {} : { concurrent }),
    runners,
    agents,
  }
}

function readEntry(value: unknown, index: number): RunnerEntry {
  if (!isRecord(value)) throw new Error(`runners[${index}] must be an object`)
  const localKey = readString(value.local_key ?? value.localKey, `runners[${index}].local_key`)
  const token = readString(value.token, `runners[${index}].token`)
  const displayName = readString(
    value.name ?? value.display_name ?? value.displayName,
    `runners[${index}].name`,
  )
  const tags = readTags(value.tags)
  const limit =
    value.limit === undefined ? DEFAULT_LIMIT : readLimit(value.limit, `runners[${index}].limit`)
  const runnerId = value.runner_id ?? value.runnerId
  if (runnerId !== undefined && typeof runnerId !== 'string')
    throw new Error(`runners[${index}].runner_id is invalid`)
  return {
    localKey,
    token,
    displayName,
    tags,
    limit,
    ...(runnerId === undefined ? {} : { runnerId }),
  }
}

function toTomlConfig(config: RunnerConfigFile): Record<string, unknown> {
  return {
    center_url: config.centerUrl,
    ...(config.concurrent === undefined ? {} : { concurrent: config.concurrent }),
    workspace_root: config.workspaceRoot,
    state_dir: config.stateDir,
    runners: runnerEntries(config).map((entry) => ({
      local_key: entry.localKey,
      name: entry.displayName,
      token: entry.token,
      runner_id: entry.runnerId,
      tags: entry.tags,
      limit: entry.limit,
    })),
    agents: config.agents.map(toTomlAgent),
  }
}

function readAgents(value: unknown): AcpRunnerAgent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('agents must be a non-empty array')
  }
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`agents[${index}] must be an object`)
    const runtimeId = readString(
      candidate.runtime_id ?? candidate.runtimeId,
      `agents[${index}].runtime_id`,
    )
    const executable = readString(candidate.executable, `agents[${index}].executable`)
    const rawArguments = candidate.arguments
    if (
      rawArguments !== undefined &&
      (!Array.isArray(rawArguments) ||
        rawArguments.some((argument) => typeof argument !== 'string' || argument.includes('\0')))
    ) {
      throw new Error(`agents[${index}].arguments is invalid`)
    }
    const wireVersion = candidate.wire_version ?? candidate.wireVersion
    if (wireVersion !== undefined && wireVersion !== 1) {
      throw new Error(`agents[${index}].wire_version is invalid`)
    }
    const modelConfigId = candidate.model_config_id ?? candidate.modelConfigId
    if (modelConfigId !== undefined && typeof modelConfigId !== 'string') {
      throw new Error(`agents[${index}].model_config_id is invalid`)
    }
    const modeConfigId = candidate.mode_config_id ?? candidate.modeConfigId
    if (modeConfigId !== undefined && typeof modeConfigId !== 'string') {
      throw new Error(`agents[${index}].mode_config_id is invalid`)
    }
    const environment = candidate.environment
    if (
      environment !== undefined &&
      (!isRecord(environment) ||
        Object.values(environment).some((item) => typeof item !== 'string'))
    ) {
      throw new Error(`agents[${index}].environment is invalid`)
    }
    return {
      runtimeId,
      executable,
      ...(rawArguments === undefined ? {} : { arguments: [...rawArguments] as string[] }),
      ...(wireVersion === undefined ? {} : { wireVersion: 1 as const }),
      ...(modelConfigId === undefined ? {} : { modelConfigId: modelConfigId as string }),
      ...(modeConfigId === undefined ? {} : { modeConfigId: modeConfigId as string }),
      ...(environment === undefined
        ? {}
        : { environment: { ...environment } as Record<string, string> }),
    }
  })
}

function toTomlAgent(agent: AcpRunnerAgent): Record<string, unknown> {
  return {
    runtime_id: agent.runtimeId,
    executable: agent.executable,
    ...(agent.arguments === undefined ? {} : { arguments: [...agent.arguments] }),
    ...(agent.wireVersion === undefined ? {} : { wire_version: agent.wireVersion }),
    ...(agent.modelConfigId === undefined ? {} : { model_config_id: agent.modelConfigId }),
    ...(agent.modeConfigId === undefined ? {} : { mode_config_id: agent.modeConfigId }),
    ...(agent.environment === undefined ? {} : { environment: { ...agent.environment } }),
  }
}

function requireTomlPath(filePath: string): void {
  if (
    typeof filePath !== 'string' ||
    filePath.trim() === '' ||
    filePath.includes('\0') ||
    filePath.includes('\r') ||
    filePath.includes('\n')
  ) {
    throw new Error('runner config path is invalid')
  }
  if (path.extname(filePath).toLowerCase() !== '.toml') {
    throw new Error('runner config must use a .toml file')
  }
}

async function validateConfigFile(filePath: string): Promise<void> {
  if (
    typeof filePath !== 'string' ||
    filePath.trim() === '' ||
    filePath.includes('\0') ||
    filePath.includes('\r') ||
    filePath.includes('\n')
  )
    throw new Error('runner config path is invalid')
  const stats = await lstat(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('runner config must be a file')
  if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)
    throw new Error('runner config must not be accessible by other users')
}

function readAbsolutePath(value: unknown, fallbackOrName: string): string {
  const valueToRead = value === undefined ? fallbackOrName : value
  const result = readString(valueToRead, value === undefined ? 'workspace_root' : fallbackOrName)
  if (!path.isAbsolute(result) || result.includes('\0'))
    throw new Error(`${fallbackOrName} must be an absolute path`)
  return result
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 4096)
    throw new Error(`${name} is required`)
  return value.trim()
}

function readTags(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 32 ||
    value.some((tag) => typeof tag !== 'string' || tag.trim() === '' || tag.length > 64)
  )
    throw new Error('tags must be a non-empty string array')
  const tags = value.map((tag) => (tag as string).trim())
  if (new Set(tags).size !== tags.length) throw new Error('tags must be unique')
  return tags
}

function readLimit(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1024)
    throw new Error(`${name} must be an integer between 1 and 1024`)
  return value as number
}

function validateRunnerConfig(config: RunnerConfig): void {
  normalizeConfig(config)
}

function isRunnerCommand(value: object): value is RunnerCommand {
  const command = value as Partial<RunnerCommand>
  return (
    (command.command === 'conversation.start' ||
      command.command === 'conversation.prompt' ||
      command.command === 'conversation.cancel' ||
      command.command === 'conversation.permission.resolve') &&
    typeof command.runtimeId === 'string' &&
    typeof command.providerId === 'string' &&
    typeof command.modelId === 'string' &&
    typeof command.workspaceRef === 'string' &&
    (command.text === undefined || typeof command.text === 'string') &&
    (command.approvalId === undefined || typeof command.approvalId === 'string') &&
    (command.decision === undefined ||
      command.decision === 'allowOnce' ||
      command.decision === 'allowSession' ||
      command.decision === 'deny' ||
      command.decision === 'cancel')
  )
}

function providerLeaseEndpoint(centerUrl: string): string {
  let endpoint: URL
  try {
    endpoint = new URL(centerUrl)
  } catch {
    throw new Error('runner center URL is invalid')
  }
  if (endpoint.protocol === 'ws:') endpoint.protocol = 'http:'
  if (endpoint.protocol === 'wss:') endpoint.protocol = 'https:'
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error('runner center URL must use HTTP or WebSocket')
  }
  endpoint.pathname = '/v1/runner/provider-lease'
  endpoint.search = ''
  endpoint.hash = ''
  return endpoint.toString()
}

function readProviderLeaseResponse(
  value: unknown,
  request: RunnerProviderLeaseRequest,
): RunnerProviderConfiguration {
  if (!isRecord(value)) throw new Error('provider lease response is invalid')
  const providerId = readString(value.providerId, 'providerId')
  const kind = readString(value.kind, 'kind')
  const displayName = readString(value.displayName, 'displayName')
  const baseUrl = readString(value.baseUrl, 'baseUrl')
  const apiKey = readString(value.apiKey, 'apiKey')
  const modelId = readString(value.modelId, 'modelId')
  if (providerId !== request.providerId || modelId !== request.modelId) {
    throw new Error('provider lease response does not match the command')
  }
  const modelIds =
    value.modelIds === undefined ? [modelId] : readStringArray(value.modelIds, 'modelIds')
  return { providerId, kind, displayName, baseUrl, apiKey, modelId, modelIds }
}

function readStringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new Error(`${name} is invalid`)
  }
  return value.map((item) => (item as string).trim())
}

function readAttached(value: unknown, envelopeLocalKey?: string): RunnerAttached {
  if (!isRecord(value)) throw new Error('runner attachment response is invalid')
  const runnerId = readString(value.runnerId, 'runnerId')
  const localKey = readString(value.localKey ?? envelopeLocalKey ?? runnerId, 'localKey')
  const attachmentId = readString(value.attachmentId ?? value.instanceId, 'attachmentId')
  const instanceId = readString(value.instanceId, 'instanceId')
  const tags = readTags(value.tags)
  const workspaceRoot = readString(value.workspaceRoot, 'workspaceRoot')
  const limit = readLimit(value.limit ?? DEFAULT_LIMIT, 'limit')
  const epoch = value.epoch
  if (!Number.isSafeInteger(epoch) || (epoch as number) < 1)
    throw new Error('runner attachment epoch is invalid')
  return {
    runnerId,
    localKey,
    attachmentId,
    instanceId,
    tags,
    workspaceRoot,
    limit,
    epoch: epoch as number,
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
