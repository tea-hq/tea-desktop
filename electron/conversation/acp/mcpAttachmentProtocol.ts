import { randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import type { Readable } from 'node:stream'

export const MCP_ATTACHMENT_PROTOCOL_VERSION = 1 as const
export const MAX_MCP_ATTACHMENT_CREDENTIAL_BYTES = 2 * 1024
export const MAX_MCP_ATTACHMENT_HANDSHAKE_BYTES = 512
export const MCP_ATTACHMENT_ACKNOWLEDGEMENT = Buffer.from('TEA-MCP-ATTACH/1 OK\n')

const ATTACHMENT_REQUEST_PREFIX = Buffer.from('TEA-MCP-ATTACH/1 ')
const CAPABILITY_BYTES = 32
const CAPABILITY_CHARS = 43
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/
const MAX_ENDPOINT_BYTES = 512

export type McpAttachmentProtocolErrorCode =
  'credentialInvalid' | 'handshakeInvalid' | 'limitExceeded'

export class McpAttachmentProtocolError extends Error {
  constructor(readonly code: McpAttachmentProtocolErrorCode) {
    super(`ACP MCP attachment protocol failure: ${code}`)
    this.name = 'McpAttachmentProtocolError'
  }
}

export interface McpAttachmentCredential {
  protocolVersion: typeof MCP_ATTACHMENT_PROTOCOL_VERSION
  endpoint: string
  capability: string
}

export function createMcpAttachmentCapability(
  createBytes: (size: number) => Buffer = randomBytes,
): string {
  const bytes = createBytes(CAPABILITY_BYTES)
  if (bytes.length !== CAPABILITY_BYTES) throw protocolError('credentialInvalid')
  return bytes.toString('base64url')
}

export function serializeMcpAttachmentCredential(
  credential: McpAttachmentCredential,
  platform: NodeJS.Platform = process.platform,
): Buffer {
  validateCredential(credential, platform)
  const output = Buffer.from(JSON.stringify(credential), 'utf8')
  if (output.length > MAX_MCP_ATTACHMENT_CREDENTIAL_BYTES) throw protocolError('limitExceeded')
  return output
}

export function parseMcpAttachmentCredential(
  input: Buffer | string,
  platform: NodeJS.Platform = process.platform,
): McpAttachmentCredential {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  if (bytes.length === 0 || bytes.length > MAX_MCP_ATTACHMENT_CREDENTIAL_BYTES) {
    throw protocolError('limitExceeded')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw protocolError('credentialInvalid')
  }
  if (!isPlainRecord(parsed)) throw protocolError('credentialInvalid')
  if (
    Object.keys(parsed).length !== 3 ||
    !Object.hasOwn(parsed, 'protocolVersion') ||
    !Object.hasOwn(parsed, 'endpoint') ||
    !Object.hasOwn(parsed, 'capability')
  ) {
    throw protocolError('credentialInvalid')
  }
  const credential = parsed as unknown as McpAttachmentCredential
  validateCredential(credential, platform)
  return { ...credential }
}

export function createMcpAttachmentRequest(capability: string): Buffer {
  validateCapability(capability)
  return Buffer.concat([
    ATTACHMENT_REQUEST_PREFIX,
    Buffer.from(capability, 'ascii'),
    Buffer.from('\n'),
  ])
}

export function verifyMcpAttachmentRequest(input: Buffer, expectedCapability: string): void {
  validateCapability(expectedCapability)
  const expectedLength = ATTACHMENT_REQUEST_PREFIX.length + CAPABILITY_CHARS + 1
  if (
    input.length !== expectedLength ||
    !input.subarray(0, ATTACHMENT_REQUEST_PREFIX.length).equals(ATTACHMENT_REQUEST_PREFIX) ||
    input.at(-1) !== 0x0a
  ) {
    throw protocolError('handshakeInvalid')
  }
  const received = input.subarray(ATTACHMENT_REQUEST_PREFIX.length, -1)
  const expected = Buffer.from(expectedCapability, 'ascii')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw protocolError('handshakeInvalid')
  }
}

export function verifyMcpAttachmentAcknowledgement(input: Buffer): void {
  if (!input.equals(MCP_ATTACHMENT_ACKNOWLEDGEMENT)) {
    throw protocolError('handshakeInvalid')
  }
}

export interface BoundedLine {
  line: Buffer
  remainder: Buffer
}

export class McpAttachmentLineAccumulator {
  private value = Buffer.alloc(0)
  private complete = false

  constructor(private readonly maxBytes = MAX_MCP_ATTACHMENT_HANDSHAKE_BYTES) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw protocolError('limitExceeded')
  }

  push(chunk: Buffer | string): BoundedLine | null {
    if (this.complete) throw protocolError('handshakeInvalid')
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const newline = bytes.indexOf(0x0a)
    const lineBytes = newline === -1 ? bytes : bytes.subarray(0, newline + 1)
    if (this.value.length + lineBytes.length > this.maxBytes) throw protocolError('limitExceeded')
    this.value = Buffer.concat([this.value, lineBytes])
    if (newline === -1) return null
    this.complete = true
    return {
      line: this.value,
      remainder: Buffer.from(bytes.subarray(newline + 1)),
    }
  }

  end(): never {
    throw protocolError('handshakeInvalid')
  }
}

export async function readMcpAttachmentLine(input: Readable): Promise<BoundedLine> {
  const accumulator = new McpAttachmentLineAccumulator(MAX_MCP_ATTACHMENT_HANDSHAKE_BYTES)
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.off('error', onError)
      input.off('close', onClose)
    }
    const onData = (chunk: Buffer | string) => {
      try {
        const result = accumulator.push(chunk)
        if (!result) return
        cleanup()
        input.pause()
        resolve(result)
      } catch (cause) {
        cleanup()
        reject(cause)
      }
    }
    const onEnd = () => {
      cleanup()
      try {
        accumulator.end()
      } catch (cause) {
        reject(cause)
      }
    }
    const onError = (cause: Error) => {
      cleanup()
      reject(cause)
    }
    const onClose = () => {
      cleanup()
      reject(protocolError('handshakeInvalid'))
    }
    input.on('data', onData)
    input.once('end', onEnd)
    input.once('error', onError)
    input.once('close', onClose)
    input.resume()
  })
}

function validateCredential(credential: McpAttachmentCredential, platform: NodeJS.Platform): void {
  if (
    !isPlainRecord(credential) ||
    credential.protocolVersion !== MCP_ATTACHMENT_PROTOCOL_VERSION ||
    !validEndpoint(credential.endpoint, platform)
  ) {
    throw protocolError('credentialInvalid')
  }
  validateCapability(credential.capability)
}

function validateCapability(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !CAPABILITY.test(value) ||
    Buffer.from(value, 'base64url').length !== CAPABILITY_BYTES
  ) {
    throw protocolError('credentialInvalid')
  }
}

function validEndpoint(value: unknown, platform: NodeJS.Platform): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    Buffer.byteLength(value, 'utf8') > MAX_ENDPOINT_BYTES ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    return false
  }
  if (platform === 'win32') {
    const prefix = '\\\\.\\pipe\\'
    return value.startsWith(prefix) && value.length > prefix.length
  }
  return path.posix.isAbsolute(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function protocolError(code: McpAttachmentProtocolErrorCode): McpAttachmentProtocolError {
  return new McpAttachmentProtocolError(code)
}
