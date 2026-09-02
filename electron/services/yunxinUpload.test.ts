import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { NodeYunxinUploadAdapter } from './yunxinUpload'

async function startUploadServer(
  handler: (body: Buffer, requestUrl: string) => { status: number; body: string },
): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const result = handler(Buffer.concat(chunks), request.url ?? '')
      response.statusCode = result.status
      response.setHeader('content-type', 'application/json')
      response.end(result.body)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server did not start')
  return { server, url: `http://127.0.0.1:${address.port}` }
}

describe('NodeYunxinUploadAdapter', () => {
  it('streams a NOS multipart upload and reports bounded metadata/progress', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-yunxin-upload-'))
    const filePath = path.join(directory, 'design.png')
    await writeFile(filePath, Buffer.from('image-bytes'))
    const { server, url } = await startUploadServer((body, requestUrl) => {
      expect(requestUrl).toBe('/chat-bucket')
      const text = body.toString('utf8')
      expect(text).toContain('name="Object"')
      expect(text).toContain('object/name.png')
      expect(text).toContain('name="x-nos-token"')
      expect(text).toContain('name="file"')
      expect(text).toContain('image-bytes')
      return { status: 200, body: JSON.stringify({ w: 640, h: 480, md5: 'ignored' }) }
    })
    const progress: number[] = []
    try {
      const result = await new NodeYunxinUploadAdapter().upload({
        filePath,
        type: 'image',
        nosToken: { bucket: 'chat-bucket', objectName: 'object%2Fname.png', token: 'secret-token' },
        commonUploadHost: url,
        commonUploadHostBackupList: [],
        onUploadProgress: (value) => progress.push(value.percentage),
      })
      expect(result).toEqual({
        name: 'design.png',
        ext: 'png',
        type: 'image',
        size: 11,
        w: 640,
        h: 480,
      })
      expect(progress.at(-1)).toBe(1)
    } finally {
      server.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('supports cancellation before any bytes are sent', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-yunxin-upload-'))
    const filePath = path.join(directory, 'notes.txt')
    await writeFile(filePath, 'notes')
    const { server, url } = await startUploadServer(() => ({ status: 200, body: '{}' }))
    try {
      const pending = new NodeYunxinUploadAdapter().upload({
        filePath,
        nosToken: { bucket: 'chat-bucket', objectName: 'notes.txt', token: 'secret-token' },
        commonUploadHost: url,
        commonUploadHostBackupList: [],
        onUploadStart: (task) => task.abort(),
      })
      await expect(pending).rejects.toMatchObject({ code: 10499 })
    } finally {
      server.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('falls back to a backup host for retryable failures', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-yunxin-upload-'))
    const filePath = path.join(directory, 'notes.txt')
    await writeFile(filePath, 'notes')
    const { server, url } = await startUploadServer(() => ({ status: 200, body: '{}' }))
    try {
      const result = await new NodeYunxinUploadAdapter().upload({
        filePath,
        nosToken: { bucket: 'chat-bucket', objectName: 'notes.txt', token: 'secret-token' },
        commonUploadHost: 'http://127.0.0.1:1',
        commonUploadHostBackupList: [url],
      })
      expect(result.name).toBe('notes.txt')
    } finally {
      server.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
