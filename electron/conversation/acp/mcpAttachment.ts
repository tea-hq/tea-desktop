import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server as NetServer, type Socket } from 'node:net'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

import { ConversationRuntimeError } from '../runtime'
import type { ConversationToolScope } from '../toolBroker'
import {
  MCP_ATTACHMENT_ACKNOWLEDGEMENT,
  MCP_ATTACHMENT_PROTOCOL_VERSION,
  createMcpAttachmentCapability,
  readMcpAttachmentLine,
  serializeMcpAttachmentCredential,
  verifyMcpAttachmentRequest,
} from './mcpAttachmentProtocol'
import { AcpConversationMcpServer } from './mcpServer'

const DEFAULT_ATTACHMENT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_CONNECTION_ATTEMPTS = 4
const MAX_MCP_MESSAGE_BYTES = 256 * 1024
const MAX_UNIX_SOCKET_PATH_BYTES = 100

export interface McpAttachmentScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface AcpMcpServerPort {
  connect(transport: Transport): Promise<void>
  close(): Promise<void>
}

export interface AcpMcpAttachmentOptions {
  platform?: NodeJS.Platform
  temporaryRoot?: string
  timeoutMs?: number
  maxConnectionAttempts?: number
  createCapability?: () => string
  createEndpointId?: () => string
  scheduler?: McpAttachmentScheduler
  createMcpServer?: (scope: ConversationToolScope) => AcpMcpServerPort
  createTransport?: (socket: Socket) => Transport
}

const DEFAULT_SCHEDULER: McpAttachmentScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

type AttachmentState = 'waiting' | 'attaching' | 'attached' | 'failed' | 'closed'

export class AcpMcpAttachment {
  readonly ready: Promise<void>
  readonly closed: Promise<void>

  private readonly sockets = new Set<Socket>()
  private readonly readyResolve: () => void
  private readonly readyReject: (cause: unknown) => void
  private readonly closedResolve: () => void
  private readonly closedReject: (cause: unknown) => void
  private readonly timeoutHandle: unknown
  private readonly serverClosed: Promise<void>
  private state: AttachmentState = 'waiting'
  private attempts = 0
  private closePromise: Promise<void> | null = null

  private constructor(
    readonly credentialPath: string,
    private readonly directory: string,
    private readonly endpoint: string,
    private readonly capability: string,
    private readonly platform: NodeJS.Platform,
    private readonly listener: NetServer,
    private readonly mcpServer: AcpMcpServerPort,
    private readonly createTransport: (socket: Socket) => Transport,
    private readonly scheduler: McpAttachmentScheduler,
    timeoutMs: number,
    private readonly maxConnectionAttempts: number,
  ) {
    let resolveReady!: () => void
    let rejectReady!: (cause: unknown) => void
    let resolveClosed!: () => void
    let rejectClosed!: (cause: unknown) => void
    this.ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    this.closed = new Promise<void>((resolve, reject) => {
      resolveClosed = resolve
      rejectClosed = reject
    })
    this.readyResolve = resolveReady
    this.readyReject = rejectReady
    this.closedResolve = resolveClosed
    this.closedReject = rejectClosed
    void this.ready.catch(() => undefined)
    void this.closed.catch(() => undefined)
    this.serverClosed = new Promise((resolve) => listener.once('close', resolve))
    listener.on('connection', (socket) => void this.handleConnection(socket))
    listener.on('error', () => this.fail(connectionFailure()))
    this.timeoutHandle = scheduler.setTimeout(
      () => this.fail(connectionFailure('ACP MCP attachment timed out')),
      timeoutMs,
    )
  }

  static async create(
    scope: ConversationToolScope,
    options: AcpMcpAttachmentOptions = {},
  ): Promise<AcpMcpAttachment> {
    const platform = options.platform ?? process.platform
    const temporaryRoot = options.temporaryRoot ?? tmpdir()
    if (!path.isAbsolute(temporaryRoot) || temporaryRoot.includes('\0')) {
      throw new ConversationRuntimeError(
        'invalidConfiguration',
        'ACP MCP temporary root must be absolute',
      )
    }
    const timeoutMs = positiveInteger(
      options.timeoutMs,
      DEFAULT_ATTACHMENT_TIMEOUT_MS,
      'ACP MCP attachment timeout',
    )
    const maxConnectionAttempts = positiveInteger(
      options.maxConnectionAttempts,
      DEFAULT_MAX_CONNECTION_ATTEMPTS,
      'ACP MCP connection-attempt limit',
    )
    const scheduler = options.scheduler ?? DEFAULT_SCHEDULER
    const directory = await mkdtemp(path.join(temporaryRoot, 'tea-mcp-'))
    const listener = createServer({ pauseOnConnect: true })
    let attachment: AcpMcpAttachment | undefined
    try {
      // The directory is the exact private path returned by mkdtemp above.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (platform !== 'win32') await chmod(directory, 0o700)
      const endpoint = createMcpAttachmentEndpoint(
        platform,
        directory,
        (options.createEndpointId ?? randomUUID)(),
      )
      const capability = (options.createCapability ?? createMcpAttachmentCapability)()
      const credentialPath = path.join(directory, 'attachment.json')
      // The credential path is a fixed child of the private mkdtemp directory.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(
        credentialPath,
        serializeMcpAttachmentCredential(
          { protocolVersion: MCP_ATTACHMENT_PROTOCOL_VERSION, endpoint, capability },
          platform,
        ),
        { flag: 'wx', mode: 0o600 },
      )
      await listen(listener, endpoint)
      // Non-Windows endpoints are fixed children of the private directory.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (platform !== 'win32') await chmod(endpoint, 0o600)
      const mcpServer = options.createMcpServer?.(scope) ?? new AcpConversationMcpServer(scope)
      attachment = new AcpMcpAttachment(
        credentialPath,
        directory,
        endpoint,
        capability,
        platform,
        listener,
        mcpServer,
        options.createTransport ??
          ((socket) =>
            new StdioServerTransport(socket, socket, { maxBufferSize: MAX_MCP_MESSAGE_BYTES })),
        scheduler,
        timeoutMs,
        maxConnectionAttempts,
      )
      return attachment
    } catch (cause) {
      await attachment?.close().catch(() => undefined)
      if (!attachment && listener.listening) await closeListener(listener).catch(() => undefined)
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
      throw cause
    }
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeOnce()
    return this.closePromise
  }

  private async handleConnection(socket: Socket): Promise<void> {
    if (this.state !== 'waiting' || this.attempts >= this.maxConnectionAttempts) {
      socket.destroy()
      return
    }
    this.attempts += 1
    this.sockets.add(socket)
    socket.once('close', () => {
      this.sockets.delete(socket)
      if (this.state === 'attaching') this.fail(connectionFailure())
      else if (this.state === 'attached') void this.close()
    })
    try {
      const { line, remainder } = await readMcpAttachmentLine(socket)
      if (remainder.length > 0) throw connectionFailure()
      verifyMcpAttachmentRequest(line, this.capability)
      if (this.state !== 'waiting') throw connectionFailure()
      this.state = 'attaching'
      this.stopListening()
      for (const candidate of this.sockets) {
        if (candidate !== socket) candidate.destroy()
      }
      await this.mcpServer.connect(this.createTransport(socket))
      await writeSocket(socket, MCP_ATTACHMENT_ACKNOWLEDGEMENT)
      // This exact path was created by this attachment and is never supplied by the Agent.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(this.credentialPath).catch(() => undefined)
      if (this.state !== 'attaching' || socket.destroyed) throw connectionFailure()
      this.scheduler.clearTimeout(this.timeoutHandle)
      this.state = 'attached'
      socket.resume()
      this.readyResolve()
    } catch {
      socket.destroy()
      if (this.state === 'attaching') {
        this.fail(connectionFailure())
      } else if (this.attempts >= this.maxConnectionAttempts) {
        this.fail(connectionFailure('ACP MCP attachment attempt limit exceeded'))
      }
    }
  }

  private fail(cause: ConversationRuntimeError): void {
    if (this.state === 'failed' || this.state === 'closed' || this.state === 'attached') return
    this.state = 'failed'
    this.readyReject(cause)
    this.closePromise ??= this.cleanup()
    void this.closePromise.catch(() => undefined)
  }

  private async closeOnce(): Promise<void> {
    if (this.state === 'closed') return
    if (this.state === 'waiting' || this.state === 'attaching') {
      this.readyReject(new ConversationRuntimeError('shutDown', 'ACP MCP attachment closed'))
    }
    this.state = 'closed'
    await this.cleanup()
  }

  private async cleanup(): Promise<void> {
    this.scheduler.clearTimeout(this.timeoutHandle)
    this.stopListening()
    for (const socket of this.sockets) socket.destroy()
    const failures: unknown[] = []
    try {
      await this.mcpServer.close()
    } catch (cause) {
      failures.push(cause)
    }
    await this.serverClosed
    try {
      await rm(this.directory, { recursive: true, force: true })
    } catch (cause) {
      failures.push(cause)
    }
    if (failures.length > 0) {
      const failure = new AggregateError(failures, 'ACP MCP attachment cleanup failed')
      this.closedReject(failure)
      throw failure
    }
    this.closedResolve()
  }

  private stopListening(): void {
    if (this.listener.listening) this.listener.close()
  }
}

async function closeListener(server: NetServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((cause) => (cause ? reject(cause) : resolve()))
  })
}

export function createMcpAttachmentEndpoint(
  platform: NodeJS.Platform,
  directory: string,
  endpointId: string,
): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(endpointId)) {
    throw new ConversationRuntimeError('invalidConfiguration', 'ACP MCP endpoint id is invalid')
  }
  if (platform === 'win32') return `\\\\.\\pipe\\tea-mcp-${endpointId}`
  const endpoint = path.join(directory, 'mcp.sock')
  if (Buffer.byteLength(endpoint, 'utf8') > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new ConversationRuntimeError('invalidConfiguration', 'ACP MCP socket path is too long')
  }
  return endpoint
}

async function listen(server: NetServer, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (cause: Error) => {
      server.off('listening', onListening)
      reject(cause)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(endpoint)
  })
}

async function writeSocket(socket: Socket, value: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(value, (cause?: Error | null) => (cause ? reject(cause) : resolve()))
  })
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new ConversationRuntimeError('invalidConfiguration', `${name} must be a positive integer`)
  }
  return resolved
}

function connectionFailure(message = 'ACP MCP attachment failed'): ConversationRuntimeError {
  return new ConversationRuntimeError('connectionFailed', message, true)
}
