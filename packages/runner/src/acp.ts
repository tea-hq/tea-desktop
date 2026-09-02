import { existsSync } from 'node:fs'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import * as acp from '@agentclientprotocol/sdk'

import type { RunnerEvent, RunnerPermissionDecision } from './protocol.js'
import type { AgentExecutor, RunnerExecutorCommand, RunnerProviderConfiguration } from './runner.js'

const DEFAULT_CLIENT_NAME = 'tea-runner'
const DEFAULT_CLIENT_VERSION = '0.1.0'
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000

export interface AcpRunnerAgent {
  runtimeId: string
  executable: string
  arguments?: readonly string[]
  wireVersion?: 1
  modelConfigId?: string
  modeConfigId?: string
  environment?: Readonly<Record<string, string>>
}

export interface AcpRunnerPermissionRequest {
  conversationId: string
  request: unknown
}

export interface AcpAgentExecutorOptions {
  agents: readonly AcpRunnerAgent[]
  clientName?: string
  clientVersion?: string
  shutdownTimeoutMs?: number
  requestPermission?: (
    request: AcpRunnerPermissionRequest,
  ) => Promise<acp.RequestPermissionResponse> | acp.RequestPermissionResponse
}

interface AcpSession {
  readonly conversationId: string
  readonly process: ChildProcessWithoutNullStreams
  readonly connection: acp.ClientConnection
  sessionId: string
  readonly agent: AcpRunnerAgent
  prompt: Promise<void> | null
  emit?: (event: RunnerEvent) => void | Promise<void>
  emissionChain: Promise<void>
  pendingPermissions: Map<string, PendingPermission>
}

interface PendingPermission {
  options: readonly acp.PermissionOption[]
  resolve(response: acp.RequestPermissionResponse): void
}

/**
 * AgentExecutor backed by the official ACP V1 SDK and stdio transport.
 *
 * The runner package deliberately owns only process and protocol concerns.
 * Center-facing authorization and plugin dispatch remain outside this class.
 */
export class AcpAgentExecutor implements AgentExecutor {
  private readonly agents: Map<string, AcpRunnerAgent>
  private readonly sessions = new Map<string, AcpSession>()
  private readonly clientName: string
  private readonly clientVersion: string
  private readonly shutdownTimeoutMs: number
  private readonly requestPermission?: (
    request: AcpRunnerPermissionRequest,
  ) => Promise<acp.RequestPermissionResponse> | acp.RequestPermissionResponse

  constructor(options: AcpAgentExecutorOptions) {
    if (options.agents.length === 0) throw new Error('at least one ACP runner agent is required')
    this.agents = new Map()
    for (const agent of options.agents) {
      validateAgent(agent)
      if (this.agents.has(agent.runtimeId)) {
        throw new Error(`duplicate ACP runner runtime: ${agent.runtimeId}`)
      }
      this.agents.set(agent.runtimeId, {
        ...agent,
        ...(agent.arguments ? { arguments: [...agent.arguments] } : {}),
        ...(agent.environment ? { environment: { ...agent.environment } } : {}),
      })
    }
    this.clientName = options.clientName?.trim() || DEFAULT_CLIENT_NAME
    this.clientVersion = options.clientVersion?.trim() || DEFAULT_CLIENT_VERSION
    this.shutdownTimeoutMs = positiveInteger(
      options.shutdownTimeoutMs,
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
      'ACP shutdown timeout',
    )
    this.requestPermission = options.requestPermission
  }

  async start(command: RunnerExecutorCommand): Promise<void> {
    if (this.sessions.has(command.conversationId)) return
    const agent = this.agents.get(command.runtimeId)
    if (!agent) throw new Error(`unsupported ACP runtime: ${command.runtimeId}`)

    const executable = resolveAcpExecutable(agent.executable)
    const child = spawn(executable, [...(agent.arguments ?? [])], {
      cwd: command.workspacePath,
      env: { ...process.env, ...agent.environment, ...acpProviderEnvironment(agent, command) },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const startupErrors: Error[] = []
    child.once('error', (error) => startupErrors.push(error))
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    )
    const application = acp
      .client({ name: this.clientName })
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        // Prompt collects updates through the per-session buffer below. The
        // callback is registered before initialization so no notification is
        // lost during session creation.
        const session = this.sessions.get(command.conversationId)
        if (session) {
          sessionUpdates(session).push(params)
          const emit = session.emit
          if (emit) {
            session.emissionChain = session.emissionChain.then(() =>
              emit({ eventType: 'acp.session.update', data: params }),
            )
          }
        }
      })
      .onRequest(acp.methods.client.session.requestPermission, ({ params }) =>
        this.handlePermissionRequest(command.conversationId, params),
      )
    const connection = application.connect(stream)
    const session: AcpSession = {
      conversationId: command.conversationId,
      process: child,
      connection,
      sessionId: '',
      agent,
      prompt: null,
      emissionChain: Promise.resolve(),
      pendingPermissions: new Map(),
    }
    this.sessions.set(command.conversationId, session)
    try {
      const initialized = await connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: this.clientName, version: this.clientVersion },
      })
      if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) {
        throw new Error(`unsupported ACP protocol version: ${initialized.protocolVersion}`)
      }
      const created = await connection.agent.request(acp.methods.agent.session.new, {
        cwd: command.workspacePath,
        mcpServers: [],
      })
      if (!created.sessionId.trim()) throw new Error('ACP Agent returned an empty session id')
      session.sessionId = created.sessionId
      await applySessionConfiguration(session, command)
    } catch (error) {
      this.sessions.delete(command.conversationId)
      await closeChild(connection, child, this.shutdownTimeoutMs)
      throw startupFailure(error, executable, child, startupErrors)
    }
  }

  async prompt(
    command: RunnerExecutorCommand,
    emit?: (event: RunnerEvent) => void | Promise<void>,
  ): Promise<RunnerEvent> {
    const session = this.requireSession(command.conversationId)
    if (session.prompt) throw new Error(`ACP conversation is busy: ${command.conversationId}`)
    if (!command.text?.trim()) throw new Error('ACP prompt must not be empty')
    const updates: acp.SessionNotification[] = []
    sessionUpdates(session, updates)
    session.emit = emit
    const request = session.connection.agent.request(acp.methods.agent.session.prompt, {
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: command.text }],
    }) as unknown as Promise<acp.PromptResponse>
    session.prompt = request.then(() => undefined)
    try {
      const response = await request
      await session.emissionChain
      const text = updates.map(extractText).join('')
      return {
        eventType: 'assistant.message',
        data: { text, stopReason: response.stopReason },
        terminal: true,
      }
    } finally {
      session.prompt = null
      session.emit = undefined
      session.emissionChain = Promise.resolve()
      sessionUpdates(session, []).length = 0
    }
  }

  async cancel(command: RunnerExecutorCommand): Promise<void> {
    const session = this.sessions.get(command.conversationId)
    if (!session) return
    this.cancelPendingPermissions(session)
    await session.connection.agent.notify(acp.methods.agent.session.cancel, {
      sessionId: session.sessionId,
    })
  }

  async shutdown(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(
      sessions.map((session) => {
        this.cancelPendingPermissions(session)
        return closeChild(session.connection, session.process, this.shutdownTimeoutMs)
      }),
    )
  }

  async resolvePermission(
    conversationId: string,
    approvalId: string,
    decision: RunnerPermissionDecision,
  ): Promise<void> {
    const session = this.requireSession(conversationId)
    const pending = session.pendingPermissions.get(approvalId)
    if (!pending) throw new Error(`ACP permission is no longer pending: ${approvalId}`)
    if (decision === 'cancel') {
      session.pendingPermissions.delete(approvalId)
      pending.resolve({ outcome: { outcome: 'cancelled' } })
      return
    }
    const optionKind =
      decision === 'allowOnce'
        ? 'allow_once'
        : decision === 'allowSession'
          ? 'allow_always'
          : 'reject_once'
    const option = pending.options.find((candidate) => candidate.kind === optionKind)
    if (!option) {
      throw new Error(`ACP Agent did not offer the requested permission decision: ${decision}`)
    }
    session.pendingPermissions.delete(approvalId)
    pending.resolve({ outcome: { outcome: 'selected', optionId: option.optionId } })
  }

  private requireSession(conversationId: string): AcpSession {
    const session = this.sessions.get(conversationId)
    if (!session) throw new Error(`ACP conversation is not started: ${conversationId}`)
    return session
  }

  private handlePermissionRequest(
    conversationId: string,
    request: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> | acp.RequestPermissionResponse {
    if (this.requestPermission) return this.requestPermission({ conversationId, request })
    const session = this.sessions.get(conversationId)
    if (!session) return { outcome: { outcome: 'cancelled' } }
    // A caller that does not provide the runner event sink cannot surface an
    // approval, so fail closed instead of leaving the ACP request suspended.
    if (!session.emit) return { outcome: { outcome: 'cancelled' } }
    const approvalId = `approval-${randomUUID()}`
    let resolvePermission!: (response: acp.RequestPermissionResponse) => void
    const response = new Promise<acp.RequestPermissionResponse>((resolve) => {
      resolvePermission = resolve
    })
    session.pendingPermissions.set(approvalId, {
      options: request.options,
      resolve: resolvePermission,
    })
    const emit = session.emit
    session.emissionChain = session.emissionChain.then(() =>
      emit({
        eventType: 'permission.requested',
        data: { approvalId, request },
      }),
    )
    return response
  }

  private cancelPendingPermissions(session: AcpSession): void {
    for (const pending of session.pendingPermissions.values()) {
      pending.resolve({ outcome: { outcome: 'cancelled' } })
    }
    session.pendingPermissions.clear()
  }
}

export function acpProviderEnvironment(
  agent: AcpRunnerAgent,
  command: RunnerExecutorCommand,
): Record<string, string> {
  const provider = command.provider
  if (!provider || !command.modelId.trim() || command.modelId === 'default') return {}
  if (!provider.apiKey.trim()) throw new Error('provider API key is empty')
  if (!safeEnvironmentText(provider.providerId) || !safeEnvironmentText(provider.apiKey)) {
    throw new Error('provider credentials are invalid')
  }
  let baseUrl: URL
  try {
    baseUrl = new URL(provider.baseUrl)
  } catch {
    throw new Error('provider base URL is invalid')
  }
  if (
    !baseUrl.hostname ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
    (baseUrl.protocol === 'http:' && !isLoopback(baseUrl.hostname))
  ) {
    throw new Error('provider base URL is invalid')
  }
  if (agent.runtimeId === 'external.claude') {
    return {
      // A cloud lease must be the only source of Claude routing. The runner
      // process may inherit a user's local login or Bedrock/Vertex settings;
      // leaving those variables in place can make the ACP agent select the
      // wrong backend even though the lease is valid.
      CLAUDE_MODEL_CONFIG: JSON.stringify({
        availableModels: uniqueModels(provider.modelIds, command.modelId),
      }),
      ANTHROPIC_CUSTOM_MODEL_OPTION: command.modelId,
      ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: command.modelId,
      ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION: `Custom model (${command.modelId})`,
      ANTHROPIC_BASE_URL: provider.baseUrl,
      ANTHROPIC_BEDROCK_BASE_URL: '',
      ANTHROPIC_VERTEX_BASE_URL: '',
      CLAUDE_CODE_USE_BEDROCK: '0',
      CLAUDE_CODE_USE_VERTEX: '0',
      ANTHROPIC_VERTEX_PROJECT_ID: '',
      CLOUD_ML_REGION: '',
      AWS_REGION: '',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_AUTH_TOKEN: 'acp-proxy',
      CLAUDE_CODE_OAUTH_TOKEN: '',
      ANTHROPIC_CUSTOM_HEADERS: `x-api-key: ${provider.apiKey}`,
    }
  }
  if (agent.runtimeId === 'external.codex') {
    return {
      MODEL_PROVIDER: provider.providerId,
      CODEX_API_KEY: provider.apiKey,
      OPENAI_API_KEY: provider.apiKey,
      CODEX_CONFIG: JSON.stringify({
        model_provider: provider.providerId,
        model_providers: {
          [provider.providerId]: {
            name: provider.displayName,
            base_url: provider.baseUrl,
            wire_api: 'responses',
            env_key: 'OPENAI_API_KEY',
          },
        },
      }),
    }
  }
  throw new Error(`provider routing is unsupported for ${agent.runtimeId}`)
}

function uniqueModels(modelIds: readonly string[], selectedModel: string): string[] {
  return [...new Set([...modelIds, selectedModel].filter((model) => model.trim() !== ''))]
}

function safeEnvironmentText(value: string): boolean {
  return !/[\u0000-\u001f\u007f]/.test(value)
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

/**
 * npm exposes dependency binaries through a `.bin` directory that may be
 * outside the current working directory (for example when `node dist/cli.js`
 * is launched from the package directory). Resolve those binaries explicitly
 * before falling back to PATH so the npx and source-build layouts both work.
 */
export function resolveAcpExecutable(executable: string): string {
  if (path.isAbsolute(executable) || executable.includes('/') || executable.includes('\\')) {
    return executable
  }
  let directory = path.dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(directory, 'node_modules', '.bin', executable)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return executable
}

const updateBuffers = new WeakMap<AcpSession, acp.SessionNotification[]>()

function sessionUpdates(
  session: AcpSession,
  replacement?: acp.SessionNotification[],
): acp.SessionNotification[] {
  if (replacement) updateBuffers.set(session, replacement)
  const current = updateBuffers.get(session)
  if (!current) {
    const created: acp.SessionNotification[] = []
    updateBuffers.set(session, created)
    return created
  }
  return current
}

function extractText(notification: acp.SessionNotification): string {
  const update = notification.update
  if (update.sessionUpdate !== 'agent_message_chunk') return ''
  const content = update.content
  return content.type === 'text' ? content.text : ''
}

async function applySessionConfiguration(
  session: AcpSession,
  command: RunnerExecutorCommand,
): Promise<void> {
  if (session.agent.modelConfigId && command.modelId.trim() && command.modelId !== 'default') {
    await session.connection.agent.request(acp.methods.agent.session.setConfigOption, {
      sessionId: session.sessionId,
      configId: session.agent.modelConfigId,
      value: command.modelId,
    })
  }
  if (session.agent.modeConfigId && command.permissionMode?.trim()) {
    await session.connection.agent.request(acp.methods.agent.session.setConfigOption, {
      sessionId: session.sessionId,
      configId: session.agent.modeConfigId,
      value: command.permissionMode,
    })
  }
}

async function closeChild(
  connection: acp.ClientConnection,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  connection.close()
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin.end()
  child.kill('SIGTERM')
  await waitForExit(child, timeoutMs)
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await waitForExit(child, timeoutMs)
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

function validateAgent(agent: AcpRunnerAgent): void {
  if (!agent.runtimeId.trim() || !agent.executable.trim()) {
    throw new Error('ACP runner runtimeId and executable are required')
  }
  if (agent.wireVersion !== undefined && agent.wireVersion !== 1) {
    throw new Error('ACP runner currently supports protocol version 1')
  }
  for (const argument of agent.arguments ?? []) {
    if (argument.includes('\0')) throw new Error('ACP runner argument contains a NUL byte')
  }
  for (const [name, value] of Object.entries(agent.environment ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('ACP runner environment is invalid')
    }
  }
}

function startupFailure(
  cause: unknown,
  executable: string,
  child: ChildProcessWithoutNullStreams,
  startupErrors: readonly Error[],
): Error {
  const message = cause instanceof Error ? cause.message : String(cause)
  const processError = startupErrors[0]
  if (processError) {
    return new Error(`ACP executable could not be started: ${executable} (${processError.message})`)
  }
  if (child.signalCode) {
    return new Error(`${message} (ACP executable ${executable} terminated by ${child.signalCode})`)
  }
  if (child.exitCode !== null) {
    return new Error(`${message} (ACP executable ${executable} exited with code ${child.exitCode})`)
  }
  return new Error(message)
}
