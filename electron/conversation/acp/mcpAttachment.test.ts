/* eslint-disable security/detect-non-literal-fs-filename -- Tests operate only on fresh temporary directories. */

import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createConnection, type Socket } from 'node:net'

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { describe, expect, it, vi } from 'vitest'

import type { ConversationToolScope } from '../toolBroker'
import {
  AcpMcpAttachment,
  createMcpAttachmentEndpoint,
  type AcpMcpServerPort,
  type McpAttachmentScheduler,
} from './mcpAttachment'
import {
  MCP_ATTACHMENT_ACKNOWLEDGEMENT,
  createMcpAttachmentCapability,
  createMcpAttachmentRequest,
  parseMcpAttachmentCredential,
} from './mcpAttachmentProtocol'

describe('AcpMcpAttachment', () => {
  it('authenticates one local connection before transferring transport ownership', async () => {
    const harness = await createHarness()
    const credential = await harness.credential()
    const socket = await connect(credential.endpoint)
    socket.write(createMcpAttachmentRequest(credential.capability).subarray(0, 8))
    socket.write(createMcpAttachmentRequest(credential.capability).subarray(8))

    await expect(readOneChunk(socket)).resolves.toEqual(MCP_ATTACHMENT_ACKNOWLEDGEMENT)
    await expect(harness.attachment.ready).resolves.toBeUndefined()
    expect(harness.mcp.connect).toHaveBeenCalledOnce()
    await expect(access(harness.attachment.credentialPath)).rejects.toBeDefined()

    socket.destroy()
    await harness.close()
    expect(harness.mcp.close).toHaveBeenCalledOnce()
  })

  it('rejects unauthorized and trailing bytes without exposing a reason', async () => {
    const harness = await createHarness({ maxConnectionAttempts: 3 })
    const credential = await harness.credential()
    const unauthorized = await connect(credential.endpoint)
    unauthorized.write(createMcpAttachmentRequest(createMcpAttachmentCapability()))
    await expect(waitForClose(unauthorized)).resolves.toBeUndefined()

    const trailing = await connect(credential.endpoint)
    trailing.write(
      Buffer.concat([createMcpAttachmentRequest(credential.capability), Buffer.from('x')]),
    )
    await expect(waitForClose(trailing)).resolves.toBeUndefined()
    expect(harness.mcp.connect).not.toHaveBeenCalled()

    const authorized = await connect(credential.endpoint)
    authorized.write(createMcpAttachmentRequest(credential.capability))
    await expect(readOneChunk(authorized)).resolves.toEqual(MCP_ATTACHMENT_ACKNOWLEDGEMENT)
    await expect(harness.attachment.ready).resolves.toBeUndefined()
    authorized.destroy()
    await harness.close()
  })

  it('fails after the bounded connection-attempt limit and cleans private state', async () => {
    const harness = await createHarness({ maxConnectionAttempts: 1 })
    const credential = await harness.credential()
    const socket = await connect(credential.endpoint)
    socket.write(createMcpAttachmentRequest(createMcpAttachmentCapability()))
    await waitForClose(socket)

    await expect(harness.attachment.ready).rejects.toMatchObject({ code: 'connectionFailed' })
    await harness.attachment.close()
    await expect(access(path.dirname(harness.attachment.credentialPath))).rejects.toBeDefined()
  })

  it('fails through the injected timeout scheduler without a wall-clock wait', async () => {
    const scheduler = new ManualScheduler()
    const harness = await createHarness({ scheduler })
    scheduler.runAll()

    await expect(harness.attachment.ready).rejects.toMatchObject({ code: 'connectionFailed' })
    await harness.attachment.close()
    expect(harness.mcp.close).toHaveBeenCalledOnce()
  })

  it('does not publish readiness when the relay disconnects during attachment', async () => {
    const harness = await createHarness({ disconnectDuringAttach: true })
    const credential = await harness.credential()
    const socket = await connect(credential.endpoint)
    socket.write(createMcpAttachmentRequest(credential.capability))

    await expect(harness.attachment.ready).rejects.toMatchObject({ code: 'connectionFailed' })
    await harness.close()
  })

  it('closes an unused attachment idempotently', async () => {
    const harness = await createHarness()
    const ready = harness.attachment.ready

    await harness.attachment.close()
    await harness.attachment.close()
    await expect(ready).rejects.toMatchObject({ code: 'shutDown' })
    expect(harness.mcp.close).toHaveBeenCalledOnce()
  })

  it('awaits listener shutdown before removing state after late setup failure', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tea-mcp-test-'))

    await expect(
      AcpMcpAttachment.create(fakeScope(), {
        temporaryRoot,
        createEndpointId: () => 'endpoint-1',
        createMcpServer: () => {
          throw new Error('MCP server construction failed')
        },
      }),
    ).rejects.toThrow('MCP server construction failed')
    await expect(readdir(temporaryRoot)).resolves.toEqual([])

    await rm(temporaryRoot, { recursive: true, force: true })
  })

  it('creates platform-specific bounded endpoints', () => {
    expect(createMcpAttachmentEndpoint('win32', '/ignored', 'endpoint-1')).toBe(
      String.raw`\\.\pipe\tea-mcp-endpoint-1`,
    )
    expect(createMcpAttachmentEndpoint('darwin', '/tmp/private', 'endpoint-1')).toBe(
      '/tmp/private/mcp.sock',
    )
    expect(() => createMcpAttachmentEndpoint('darwin', '/tmp/private', '../escape')).toThrowError(
      expect.objectContaining({ code: 'invalidConfiguration' }),
    )
  })
})

async function createHarness(
  options: {
    maxConnectionAttempts?: number
    scheduler?: McpAttachmentScheduler
    disconnectDuringAttach?: boolean
  } = {},
) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tea-mcp-test-'))
  const mcp: AcpMcpServerPort = {
    connect: vi.fn(async (_transport: Transport) => undefined),
    close: vi.fn(async () => undefined),
  }
  const attachment = await AcpMcpAttachment.create(fakeScope(), {
    temporaryRoot,
    createMcpServer: () => mcp,
    createTransport: (socket) => {
      if (options.disconnectDuringAttach) socket.destroy()
      return {} as Transport
    },
    createEndpointId: () => 'endpoint-1',
    ...options,
  })
  return {
    attachment,
    mcp,
    credential: async () =>
      parseMcpAttachmentCredential(await readFile(attachment.credentialPath), process.platform),
    close: async () => {
      await attachment.close()
      await rm(temporaryRoot, { recursive: true, force: true })
    },
  }
}

function fakeScope(): ConversationToolScope {
  return {
    conversationId: 'conversation-1',
    revision: 1,
    definitions: () => [],
    call: vi.fn(),
  }
}

async function connect(endpoint: string): Promise<Socket> {
  const socket = createConnection(endpoint)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  return socket
}

async function readOneChunk(socket: Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    socket.once('data', (chunk: Buffer) => resolve(Buffer.from(chunk)))
    socket.once('error', reject)
    socket.once('close', () => reject(new Error('socket closed before data')))
  })
}

async function waitForClose(socket: Socket): Promise<void> {
  if (socket.closed) return
  await new Promise<void>((resolve) => socket.once('close', () => resolve()))
}

class ManualScheduler implements McpAttachmentScheduler {
  private readonly callbacks = new Map<number, () => void>()
  private nextId = 1

  setTimeout(callback: () => void): number {
    const id = this.nextId++
    this.callbacks.set(id, callback)
    return id
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number)
  }

  runAll(): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) callback()
  }
}
