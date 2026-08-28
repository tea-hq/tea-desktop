import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  MAX_MCP_ATTACHMENT_CREDENTIAL_BYTES,
  MCP_ATTACHMENT_ACKNOWLEDGEMENT,
  McpAttachmentLineAccumulator,
  createMcpAttachmentCapability,
  createMcpAttachmentRequest,
  parseMcpAttachmentCredential,
  serializeMcpAttachmentCredential,
  verifyMcpAttachmentAcknowledgement,
  verifyMcpAttachmentRequest,
  type McpAttachmentCredential,
} from './mcpAttachmentProtocol'

describe('ACP MCP attachment protocol', () => {
  it('round-trips a bounded V1 credential without a literal capability fixture', () => {
    const credential = unixCredential()
    const encoded = serializeMcpAttachmentCredential(credential, 'darwin')

    expect(parseMcpAttachmentCredential(encoded, 'darwin')).toEqual(credential)
    expect(encoded.includes(Buffer.from(credential.capability))).toBe(true)
  })

  it('validates platform endpoints and the exact credential shape', () => {
    const credential = unixCredential()
    expect(() =>
      parseMcpAttachmentCredential(
        JSON.stringify({ ...credential, endpoint: 'relative.sock' }),
        'darwin',
      ),
    ).toThrowError(expect.objectContaining({ code: 'credentialInvalid' }))
    expect(() =>
      parseMcpAttachmentCredential(
        JSON.stringify({ ...credential, endpoint: String.raw`\\.\pipe\tea-mcp-test` }),
        'win32',
      ),
    ).not.toThrow()
    expect(() =>
      parseMcpAttachmentCredential(JSON.stringify({ ...credential, extra: true }), 'darwin'),
    ).toThrowError(expect.objectContaining({ code: 'credentialInvalid' }))
    expect(() =>
      parseMcpAttachmentCredential(
        JSON.stringify({ ...credential, capability: 'not-a-capability' }),
        'darwin',
      ),
    ).toThrowError(expect.objectContaining({ code: 'credentialInvalid' }))
  })

  it('rejects invalid UTF-8 and oversized credential documents', () => {
    expect(() => parseMcpAttachmentCredential(Buffer.from([0xc3, 0x28]), 'darwin')).toThrowError(
      expect.objectContaining({ code: 'credentialInvalid' }),
    )
    expect(() =>
      parseMcpAttachmentCredential(Buffer.alloc(MAX_MCP_ATTACHMENT_CREDENTIAL_BYTES + 1), 'darwin'),
    ).toThrowError(expect.objectContaining({ code: 'limitExceeded' }))
  })

  it('uses an exact request and timing-safe capability check', () => {
    const capability = createMcpAttachmentCapability()
    const request = createMcpAttachmentRequest(capability)

    expect(() => verifyMcpAttachmentRequest(request, capability)).not.toThrow()
    expect(() => verifyMcpAttachmentRequest(request, createMcpAttachmentCapability())).toThrowError(
      expect.objectContaining({ code: 'handshakeInvalid' }),
    )
    expect(() =>
      verifyMcpAttachmentRequest(Buffer.from('TEA-MCP-ATTACH/2 invalid\n'), capability),
    ).toThrowError(expect.objectContaining({ code: 'handshakeInvalid' }))
  })

  it('accumulates a partial bounded line and exposes trailing bytes', () => {
    const capability = createMcpAttachmentCapability()
    const request = createMcpAttachmentRequest(capability)
    const accumulator = new McpAttachmentLineAccumulator(request.length)

    expect(accumulator.push(request.subarray(0, 8))).toBeNull()
    expect(accumulator.push(Buffer.concat([request.subarray(8), Buffer.from('trailing')]))).toEqual(
      {
        line: request,
        remainder: Buffer.from('trailing'),
      },
    )
    expect(() => accumulator.push(Buffer.from('again'))).toThrowError(
      expect.objectContaining({ code: 'handshakeInvalid' }),
    )
  })

  it('rejects an oversized or unterminated handshake line', () => {
    const accumulator = new McpAttachmentLineAccumulator(4)
    expect(() => accumulator.push(Buffer.from('12345'))).toThrowError(
      expect.objectContaining({ code: 'limitExceeded' }),
    )
    expect(() => new McpAttachmentLineAccumulator().end()).toThrowError(
      expect.objectContaining({ code: 'handshakeInvalid' }),
    )
  })

  it('requires the exact attachment acknowledgement', () => {
    expect(() => verifyMcpAttachmentAcknowledgement(MCP_ATTACHMENT_ACKNOWLEDGEMENT)).not.toThrow()
    expect(() =>
      verifyMcpAttachmentAcknowledgement(Buffer.from('TEA-MCP-ATTACH/1 NO\n')),
    ).toThrowError(expect.objectContaining({ code: 'handshakeInvalid' }))
  })
})

function unixCredential(): McpAttachmentCredential {
  return {
    protocolVersion: 1,
    endpoint: `/tmp/tea-mcp-${randomBytes(8).toString('hex')}.sock`,
    capability: createMcpAttachmentCapability(),
  }
}
