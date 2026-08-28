/* eslint-disable security/detect-non-literal-fs-filename -- Tests operate only on fresh temporary directories. */

import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server, type Socket } from 'node:net'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import {
  MCP_PROCESS_FAILURE_DIAGNOSTIC,
  runMcpProcess,
  runMcpProxy,
  type McpProxyScheduler,
} from './mcpProxy'
import {
  MCP_ATTACHMENT_ACKNOWLEDGEMENT,
  createMcpAttachmentCapability,
  readMcpAttachmentLine,
  serializeMcpAttachmentCredential,
  verifyMcpAttachmentRequest,
} from './mcpAttachmentProtocol'

describe('ACP MCP relay process', () => {
  it('deletes the capability file and blindly relays bytes after authentication', async () => {
    const harness = await createProxyHarness(async (socket, capability) => {
      const { line, remainder } = await readMcpAttachmentLine(socket)
      expect(remainder).toHaveLength(0)
      verifyMcpAttachmentRequest(line, capability)
      socket.write(MCP_ATTACHMENT_ACKNOWLEDGEMENT)
      socket.once('data', (chunk: Buffer) => {
        expect(chunk).toEqual(Buffer.from('agent-mcp-bytes'))
        socket.end(Buffer.from('main-mcp-bytes'))
      })
      socket.resume()
    })
    const input = new PassThrough()
    const output = new PassThrough()
    const received: Buffer[] = []
    output.on('data', (chunk: Buffer) => received.push(Buffer.from(chunk)))
    input.end(Buffer.from('agent-mcp-bytes'))

    await runMcpProxy(harness.credentialPath, { input, output })

    expect(Buffer.concat(received)).toEqual(Buffer.from('main-mcp-bytes'))
    await expect(readFile(harness.credentialPath)).rejects.toBeDefined()
    await harness.close()
  })

  it('removes an invalid private credential before failing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tea-mcp-proxy-test-'))
    const credentialPath = path.join(directory, 'attachment.json')
    await writeFile(credentialPath, '{"invalid":true}', { mode: 0o600 })

    await expect(runMcpProxy(credentialPath)).rejects.toBeInstanceOf(Error)
    await expect(readFile(credentialPath)).rejects.toBeDefined()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects a capability file readable by other OS users', async () => {
    if (process.platform === 'win32') return
    const directory = await mkdtemp(path.join(tmpdir(), 'tea-mcp-proxy-test-'))
    const credentialPath = path.join(directory, 'attachment.json')
    await writeFile(credentialPath, '{}', { mode: 0o644 })
    await chmod(credentialPath, 0o644)

    await expect(runMcpProxy(credentialPath)).rejects.toBeInstanceOf(Error)
    await expect(readFile(credentialPath)).rejects.toBeDefined()
    await rm(directory, { recursive: true, force: true })
  })

  it('times out a silent endpoint through the injected scheduler', async () => {
    const accepted = deferred<Socket>()
    const scheduler = new ManualScheduler()
    const harness = await createProxyHarness(async (socket) => {
      accepted.resolve(socket)
      await readMcpAttachmentLine(socket)
    })
    const result = runMcpProxy(harness.credentialPath, { scheduler })
    await accepted.promise
    scheduler.runAll()

    await expect(result).rejects.toBeInstanceOf(Error)
    await harness.close()
  })

  it('prints only a fixed diagnostic from the executable boundary', async () => {
    const diagnostics: string[] = []
    const credentialPath = path.join(tmpdir(), 'private-capability-path')
    const exitCode = await runMcpProcess(
      ['electron', 'mcp-process.js', credentialPath],
      { write: (value) => diagnostics.push(value) },
      vi.fn(async () => {
        throw new Error(`secret path: ${credentialPath}`)
      }),
    )

    expect(exitCode).toBe(1)
    expect(diagnostics).toEqual([MCP_PROCESS_FAILURE_DIAGNOSTIC])
    expect(diagnostics.join('')).not.toContain(credentialPath)
  })
})

async function createProxyHarness(handle: (socket: Socket, capability: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tea-mcp-proxy-test-'))
  const endpoint = path.join(directory, 'mcp.sock')
  const capability = createMcpAttachmentCapability()
  const credentialPath = path.join(directory, 'attachment.json')
  await writeFile(
    credentialPath,
    serializeMcpAttachmentCredential({ protocolVersion: 1, endpoint, capability }),
    { mode: 0o600 },
  )
  const server = createServer({ pauseOnConnect: true }, (socket) => {
    void handle(socket, capability).catch(() => socket.destroy())
  })
  await listen(server, endpoint)
  return {
    credentialPath,
    close: async () => {
      await closeServer(server)
      await rm(directory, { recursive: true, force: true })
    },
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((cause) => (cause ? reject(cause) : resolve()))
  })
}

async function listen(server: Server, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
    server.listen(endpoint)
  })
}

class ManualScheduler implements McpProxyScheduler {
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
