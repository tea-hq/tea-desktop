import { Readable, Writable } from 'node:stream'

import * as acpV1 from '@agentclientprotocol/sdk'
import * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

import type {
  AcpAgentDefinition,
  AcpWireVersion,
  ResolvedAcpAgentArtifact,
} from './agentDefinition'
import { AcpAgentArtifactResolver } from './artifactResolver'
import { AcpHostError } from './errors'
import { AcpProcessLauncher, type AcpProcess, type LaunchAcpAgentOptions } from './process'

export interface AcpClientInfo {
  name: string
  version: string
}

export interface AcpInitialization {
  protocolVersion: AcpWireVersion
  agentInfo?: { name: string; version: string; title?: string | null } | null
  capabilities?: unknown
  supportsLoadSession: boolean
  supportsResumeSession: boolean
}

export type AcpSessionUpdateNotification =
  | { wireVersion: 1; notification: acpV1.SessionNotification }
  | { wireVersion: 2; notification: acpV2.UpdateSessionNotification }

export type AcpPermissionRequest =
  | {
      wireVersion: 1
      requestId: acpV1.JsonRpcId
      request: acpV1.RequestPermissionRequest
    }
  | {
      wireVersion: 2
      requestId: acpV2.JsonRpcId
      request: acpV2.RequestPermissionRequest
    }

export interface AcpPermissionResponse {
  outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string }
}

export interface AcpProtocolHandlers {
  sessionUpdate(notification: AcpSessionUpdateNotification): void | Promise<void>
  requestPermission(
    request: AcpPermissionRequest,
  ): AcpPermissionResponse | Promise<AcpPermissionResponse>
}

export type AcpProtocolConnection =
  | {
      wireVersion: 1
      initialization: AcpInitialization
      connection: acpV1.ClientConnection
      context: acpV1.ClientContext
      closed: Promise<void>
      close(error?: unknown): void
    }
  | {
      wireVersion: 2
      initialization: AcpInitialization
      connection: acpV2.ClientConnection
      context: acpV2.ClientContext
      closed: Promise<void>
      close(error?: unknown): void
    }

export interface AcpProtocolDriver {
  connect(
    process: AcpProcess,
    wireVersion: AcpWireVersion,
    clientInfo: AcpClientInfo,
    handlers?: AcpProtocolHandlers,
  ): Promise<AcpProtocolConnection>
}

export interface AcpArtifactResolverPort {
  resolve(definition: AcpAgentDefinition): Promise<ResolvedAcpAgentArtifact>
}

export interface AcpProcessLauncherPort {
  launch(artifact: ResolvedAcpAgentArtifact, options: LaunchAcpAgentOptions): AcpProcess
}

export class OfficialAcpProtocolDriver implements AcpProtocolDriver {
  constructor(private readonly initializationTimeoutMs = 15_000) {}

  async connect(
    process: AcpProcess,
    wireVersion: AcpWireVersion,
    clientInfo: AcpClientInfo,
    handlers: AcpProtocolHandlers = NOOP_PROTOCOL_HANDLERS,
  ): Promise<AcpProtocolConnection> {
    return wireVersion === 2
      ? this.connectV2(process, clientInfo, handlers)
      : this.connectV1(process, clientInfo, handlers)
  }

  private async connectV1(
    process: AcpProcess,
    clientInfo: AcpClientInfo,
    handlers: AcpProtocolHandlers,
  ): Promise<AcpProtocolConnection> {
    const stream = acpV1.ndJsonStream(
      Writable.toWeb(process.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(process.stdout) as ReadableStream<Uint8Array>,
    )
    const application = acpV1
      .client({ name: clientInfo.name })
      .onNotification(acpV1.methods.client.session.update, ({ params }) =>
        handlers.sessionUpdate({ wireVersion: 1, notification: params }),
      )
      .onRequest(acpV1.methods.client.session.requestPermission, ({ params, requestId }) =>
        handlers.requestPermission({ wireVersion: 1, requestId, request: params }),
      )
    const connection = application.connect(stream)
    try {
      const initialization = (await withInitializationTimeout(
        connection.agent.request(acpV1.methods.agent.initialize, {
          protocolVersion: acpV1.PROTOCOL_VERSION,
          clientCapabilities: {},
          clientInfo,
        }),
        process.definition.id,
        this.initializationTimeoutMs,
      )) as acpV1.InitializeResponse
      if (initialization.protocolVersion !== acpV1.PROTOCOL_VERSION) {
        throw unsupportedVersion(initialization.protocolVersion)
      }
      return {
        wireVersion: 1,
        initialization: {
          protocolVersion: 1,
          agentInfo: initialization.agentInfo,
          capabilities: initialization.agentCapabilities,
          ...normalizeAcpRecoveryCapabilities(1, initialization.agentCapabilities),
        },
        connection,
        context: connection.agent,
        closed: connection.closed,
        close: (error) => connection.close(error),
      }
    } catch (error) {
      connection.close(error)
      if (error instanceof AcpHostError) throw error
      throw connectionFailure(process.definition.id, error)
    }
  }

  private async connectV2(
    process: AcpProcess,
    clientInfo: AcpClientInfo,
    handlers: AcpProtocolHandlers,
  ): Promise<AcpProtocolConnection> {
    const stream = acpV2.ndJsonStream(
      Writable.toWeb(process.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(process.stdout) as ReadableStream<Uint8Array>,
    )
    const application = acpV2
      .client({ name: clientInfo.name })
      .onNotification(acpV2.methods.client.session.update, ({ params }) =>
        handlers.sessionUpdate({ wireVersion: 2, notification: params }),
      )
      .onRequest(acpV2.methods.client.session.requestPermission, ({ params, requestId }) =>
        handlers.requestPermission({ wireVersion: 2, requestId, request: params }),
      )
    const connection = application.connect(stream)
    try {
      const initialization = (await withInitializationTimeout(
        connection.agent.request(acpV2.methods.agent.initialize, {
          protocolVersion: acpV2.PROTOCOL_VERSION,
          capabilities: {},
          info: clientInfo,
        }),
        process.definition.id,
        this.initializationTimeoutMs,
      )) as acpV2.InitializeResponse
      if (initialization.protocolVersion !== acpV2.PROTOCOL_VERSION) {
        throw unsupportedVersion(initialization.protocolVersion)
      }
      return {
        wireVersion: 2,
        initialization: {
          protocolVersion: 2,
          agentInfo: initialization.info,
          capabilities: initialization.capabilities,
          ...normalizeAcpRecoveryCapabilities(2, initialization.capabilities),
        },
        connection,
        context: connection.agent,
        closed: connection.closed,
        close: (error) => connection.close(error),
      }
    } catch (error) {
      connection.close(error)
      if (isVersionRejection(error)) {
        throw new AcpHostError(
          'protocolVersionUnsupported',
          `ACP Agent does not accept V2: ${process.definition.id}`,
          false,
          { cause: error },
        )
      }
      if (error instanceof AcpHostError) throw error
      throw connectionFailure(process.definition.id, error)
    }
  }
}

export class AcpAgentConnection {
  readonly closed: Promise<void>
  private closePromise: Promise<void> | null = null

  constructor(
    readonly process: AcpProcess,
    readonly protocol: AcpProtocolConnection,
  ) {
    this.closed = protocol.closed.finally(() => process.close())
    void process.closed.then((exit) => {
      if (exit.error || exit.code !== 0) protocol.close(exit.error ?? new Error('ACP Agent exited'))
    })
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeOnce()
    return this.closePromise
  }

  private async closeOnce(): Promise<void> {
    this.protocol.close()
    await this.process.close()
  }
}

export class AcpConnectionFactory {
  constructor(
    private readonly artifactResolver: AcpArtifactResolverPort = new AcpAgentArtifactResolver(),
    private readonly processLauncher: AcpProcessLauncherPort = new AcpProcessLauncher(),
    private readonly protocolDriver: AcpProtocolDriver = new OfficialAcpProtocolDriver(),
    private readonly clientInfo: AcpClientInfo = { name: 'tea-desktop', version: '0.1.0' },
  ) {}

  async connect(
    definition: AcpAgentDefinition,
    launchOptions: LaunchAcpAgentOptions,
    handlers?: AcpProtocolHandlers,
    requiredWireVersion?: AcpWireVersion,
  ): Promise<AcpAgentConnection> {
    const wireVersions = requiredWireVersion
      ? definition.preferredWireVersions.includes(requiredWireVersion)
        ? [requiredWireVersion]
        : []
      : definition.preferredWireVersions
    if (wireVersions.length === 0) {
      throw new AcpHostError(
        'protocolVersionUnsupported',
        `ACP Agent definition does not support recorded wire version ${requiredWireVersion}: ${definition.id}`,
      )
    }
    const artifact = await this.artifactResolver.resolve(definition)
    for (const wireVersion of wireVersions) {
      const process = this.processLauncher.launch(artifact, launchOptions)
      try {
        await process.started
        const protocol = await this.protocolDriver.connect(
          process,
          wireVersion,
          this.clientInfo,
          handlers,
        )
        return new AcpAgentConnection(process, protocol)
      } catch (error) {
        await process.close()
        if (!requiredWireVersion && wireVersion === 2 && isVersionRejection(error)) continue
        if (error instanceof AcpHostError) throw error
        throw connectionFailure(definition.id, error)
      }
    }
    throw new AcpHostError(
      'protocolVersionUnsupported',
      `ACP Agent has no mutually supported wire version: ${definition.id}`,
    )
  }
}

export function normalizeAcpRecoveryCapabilities(
  wireVersion: AcpWireVersion,
  capabilities: unknown,
): Pick<AcpInitialization, 'supportsLoadSession' | 'supportsResumeSession'> {
  if (!isRecord(capabilities)) {
    return { supportsLoadSession: false, supportsResumeSession: false }
  }
  if (wireVersion === 1) {
    const sessionCapabilities = isRecord(capabilities.sessionCapabilities)
      ? capabilities.sessionCapabilities
      : undefined
    return {
      supportsLoadSession: capabilities.loadSession === true,
      supportsResumeSession:
        sessionCapabilities !== undefined && isRecord(sessionCapabilities.resume),
    }
  }
  return {
    supportsLoadSession: false,
    supportsResumeSession: isRecord(capabilities.session),
  }
}

const NOOP_PROTOCOL_HANDLERS: AcpProtocolHandlers = {
  sessionUpdate: () => undefined,
  requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
}

function isVersionRejection(error: unknown): boolean {
  if (error instanceof AcpHostError) return error.code === 'protocolVersionUnsupported'
  const candidate = error as { code?: unknown } | null
  return candidate?.code === -32600 || candidate?.code === -32602
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unsupportedVersion(version: number): AcpHostError {
  return new AcpHostError(
    'protocolVersionUnsupported',
    `ACP Agent selected unsupported protocol version: ${version}`,
  )
}

function connectionFailure(agentId: string, cause: unknown): AcpHostError {
  return new AcpHostError('connectionFailed', `ACP Agent connection failed: ${agentId}`, true, {
    cause,
  })
}

export async function withInitializationTimeout<T>(
  operation: Promise<T>,
  agentId: string,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AcpHostError(
            'initializationTimeout',
            `ACP Agent initialization timed out: ${agentId}`,
            true,
          ),
        ),
      timeoutMs,
    )
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
