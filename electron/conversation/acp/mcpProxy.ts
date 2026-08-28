import { lstat, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createConnection, type Socket } from 'node:net'
import type { Readable, Writable } from 'node:stream'

import {
  createMcpAttachmentRequest,
  parseMcpAttachmentCredential,
  readMcpAttachmentLine,
  verifyMcpAttachmentAcknowledgement,
} from './mcpAttachmentProtocol'

const DEFAULT_PROXY_HANDSHAKE_TIMEOUT_MS = 15_000
const MAX_CAPABILITY_PATH_BYTES = 1024
export const MCP_PROCESS_FAILURE_DIAGNOSTIC = 'Tea MCP relay failed\n'

export interface McpProxyScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface McpProxyOptions {
  input?: Readable
  output?: Writable
  platform?: NodeJS.Platform
  handshakeTimeoutMs?: number
  scheduler?: McpProxyScheduler
  connect?: (endpoint: string) => Socket
}

const DEFAULT_SCHEDULER: McpProxyScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class McpProxyError extends Error {
  constructor() {
    super('ACP MCP relay failed')
    this.name = 'McpProxyError'
  }
}

export async function runMcpProxy(
  credentialPath: string,
  options: McpProxyOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform
  const credential = await readOneTimeCredential(credentialPath, platform)
  const socket = (options.connect ?? createConnection)(credential.endpoint)
  try {
    await withTimeout(
      authenticate(socket, credential.capability),
      positiveInteger(options.handshakeTimeoutMs, DEFAULT_PROXY_HANDSHAKE_TIMEOUT_MS),
      options.scheduler ?? DEFAULT_SCHEDULER,
      () => socket.destroy(),
    )
    await relay(options.input ?? process.stdin, options.output ?? process.stdout, socket)
  } catch {
    socket.destroy()
    throw new McpProxyError()
  }
}

export async function runMcpProcess(
  argv: readonly string[],
  errorOutput: { write(value: string): unknown },
  runProxy: (credentialPath: string) => Promise<void> = runMcpProxy,
): Promise<number> {
  try {
    if (argv.length !== 3) throw new McpProxyError()
    await runProxy(argv[2])
    return 0
  } catch {
    errorOutput.write(MCP_PROCESS_FAILURE_DIAGNOSTIC)
    return 1
  }
}

async function readOneTimeCredential(
  credentialPath: string,
  platform: NodeJS.Platform,
): Promise<ReturnType<typeof parseMcpAttachmentCredential>> {
  if (
    typeof credentialPath !== 'string' ||
    !path.isAbsolute(credentialPath) ||
    Buffer.byteLength(credentialPath, 'utf8') > MAX_CAPABILITY_PATH_BYTES ||
    credentialPath.includes('\0') ||
    credentialPath.includes('\r') ||
    credentialPath.includes('\n')
  ) {
    throw new McpProxyError()
  }

  let shouldDelete = false
  let document: Buffer
  try {
    // The argv path is absolute and bounded before filesystem use.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stats = await lstat(credentialPath)
    shouldDelete = true
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size < 1 ||
      stats.size > 2 * 1024 ||
      (platform !== 'win32' && (stats.mode & 0o077) !== 0) ||
      (platform !== 'win32' &&
        typeof process.getuid === 'function' &&
        stats.uid !== process.getuid())
    ) {
      throw new McpProxyError()
    }
    // Owner, mode, file type, and size were validated immediately above.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    document = await readFile(credentialPath)
  } catch {
    throw new McpProxyError()
  } finally {
    if (shouldDelete) {
      // Delete the same validated one-time path before attempting attachment.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(credentialPath).catch(() => {
        throw new McpProxyError()
      })
    }
  }
  return parseMcpAttachmentCredential(document, platform)
}

async function authenticate(socket: Socket, capability: string): Promise<void> {
  await waitForConnection(socket)
  await writeSocket(socket, createMcpAttachmentRequest(capability))
  const { line, remainder } = await readMcpAttachmentLine(socket)
  if (remainder.length > 0) throw new McpProxyError()
  verifyMcpAttachmentAcknowledgement(line)
}

async function waitForConnection(socket: Socket): Promise<void> {
  if (!socket.connecting && !socket.destroyed) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off('connect', onConnect)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const onConnect = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new McpProxyError())
    }
    const onClose = () => {
      cleanup()
      reject(new McpProxyError())
    }
    socket.once('connect', onConnect)
    socket.once('error', onError)
    socket.once('close', onClose)
  })
}

async function relay(input: Readable, output: Writable, socket: Socket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      input.unpipe(socket)
      socket.unpipe(output)
      input.off('error', onError)
      output.off('error', onError)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const onError = () => {
      cleanup()
      reject(new McpProxyError())
    }
    const onClose = (hadError: boolean) => {
      cleanup()
      if (hadError) reject(new McpProxyError())
      else resolve()
    }
    input.once('error', onError)
    output.once('error', onError)
    socket.once('error', onError)
    socket.once('close', onClose)
    input.pipe(socket)
    socket.pipe(output, { end: false })
  })
}

async function writeSocket(socket: Socket, value: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(value, (cause?: Error | null) => (cause ? reject(cause) : resolve()))
  })
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  scheduler: McpProxyScheduler,
  onTimeout: () => void,
): Promise<T> {
  let handle: unknown
  const timeout = new Promise<never>((_, reject) => {
    handle = scheduler.setTimeout(() => {
      onTimeout()
      reject(new McpProxyError())
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    scheduler.clearTimeout(handle)
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1) throw new McpProxyError()
  return resolved
}
