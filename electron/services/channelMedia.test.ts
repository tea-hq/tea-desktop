import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  ChannelMediaSourceError,
  type ChannelMediaSource,
} from '../../src/infrastructure/channels/channelMediaSource'
import { ChannelMediaSaveService, type ChannelMediaFetch } from './channelMedia'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'tea-channel-media-'))
  directories.push(directory)
  return directory
}

const request = {
  operationId: 'media-save-1',
  messageRef: { channelRef: 'product', messageClientId: 'image-1' },
}

function resolver(
  source: ChannelMediaSource = {
    url: 'https://cdn.example.test/design.png',
    fileName: 'design.png',
    expectedSize: 12,
  },
) {
  return { resolveMediaSource: vi.fn(() => source) }
}

describe('ChannelMediaSaveService', () => {
  it('streams to a sibling part file and atomically publishes the destination', async () => {
    const directory = await temporaryDirectory()
    const destination = path.join(directory, 'design.png')
    const progress = vi.fn()
    const fetchMedia = vi.fn<ChannelMediaFetch>(async () =>
      Promise.resolve(
        new Response('hello media', {
          status: 200,
          headers: { 'content-length': '11', 'content-type': 'image/png' },
        }),
      ),
    )
    const service = new ChannelMediaSaveService(resolver(), async () => destination, progress, {
      fetchMedia,
      createId: () => 'fixed',
    })

    await expect(service.save(request)).resolves.toEqual({
      status: 'saved',
      fileName: 'design.png',
      byteLength: 11,
    })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(readFile(destination, 'utf8')).resolves.toBe('hello media')
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(readdir(directory)).resolves.toEqual(['design.png'])
    expect(fetchMedia).toHaveBeenCalledWith(
      new URL('https://cdn.example.test/design.png'),
      expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
    )
    expect(progress).toHaveBeenLastCalledWith({
      operationId: request.operationId,
      phase: 'saving',
      receivedBytes: 11,
      totalBytes: 11,
    })
  })

  it('treats destination dismissal as cancellation without fetching', async () => {
    const fetchMedia = vi.fn<ChannelMediaFetch>()
    const service = new ChannelMediaSaveService(resolver(), async () => null, vi.fn(), {
      fetchMedia,
    })

    await expect(service.save(request)).resolves.toEqual({ status: 'cancelled' })
    expect(fetchMedia).not.toHaveBeenCalled()
  })

  it('rejects duplicate operations and preserves source resolver failures', async () => {
    let selectDestination!: (value: string | null) => void
    const selection = new Promise<string | null>((resolve) => {
      selectDestination = resolve
    })
    const service = new ChannelMediaSaveService(resolver(), () => selection, vi.fn())
    const first = service.save(request)

    await expect(service.save(request)).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
    selectDestination(null)
    await expect(first).resolves.toEqual({ status: 'cancelled' })

    const unavailable = new ChannelMediaSaveService(
      {
        resolveMediaSource: () => {
          throw new ChannelMediaSourceError('messageUnavailable')
        },
      },
      async () => null,
      vi.fn(),
    )
    await expect(
      unavailable.save({ ...request, operationId: 'media-save-2' }),
    ).rejects.toMatchObject({ code: 'messageUnavailable', retryable: false })
  })

  it('follows bounded HTTPS redirects and rejects protocol downgrades', async () => {
    const directory = await temporaryDirectory()
    const destination = path.join(directory, 'redirect.png')
    const fetchMedia = vi.fn<ChannelMediaFetch>(async (url) => {
      if (url.pathname === '/start')
        return new Response(null, { status: 302, headers: { location: '/final' } })
      return new Response('done', { status: 200, headers: { 'content-length': '4' } })
    })
    const service = new ChannelMediaSaveService(
      resolver({
        url: 'https://cdn.example.test/start',
        fileName: 'redirect.png',
        expectedSize: 4,
      }),
      async () => destination,
      vi.fn(),
      { fetchMedia },
    )

    await expect(service.save(request)).resolves.toMatchObject({ status: 'saved', byteLength: 4 })
    expect(fetchMedia).toHaveBeenCalledTimes(2)

    const downgrade = new ChannelMediaSaveService(
      resolver({ url: 'https://cdn.example.test/start', fileName: 'blocked.png', expectedSize: 4 }),
      async () => path.join(directory, 'blocked.png'),
      vi.fn(),
      {
        fetchMedia: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'http://cdn.example.test/insecure' },
          }),
      },
    )
    await expect(downgrade.save({ ...request, operationId: 'media-save-2' })).rejects.toMatchObject(
      { code: 'unsupportedProtocol', retryable: false },
    )
  })

  it('rejects declared and streamed responses above the configured limit', async () => {
    const directory = await temporaryDirectory()
    const declared = new ChannelMediaSaveService(
      resolver({ url: 'https://cdn.example.test/large', fileName: 'large.bin', expectedSize: 4 }),
      async () => path.join(directory, 'declared.bin'),
      vi.fn(),
      {
        maximumBytes: 4,
        fetchMedia: async () =>
          new Response('large', { status: 200, headers: { 'content-length': '5' } }),
      },
    )
    await expect(declared.save(request)).rejects.toMatchObject({
      code: 'tooLarge',
      retryable: false,
    })

    const streamed = new ChannelMediaSaveService(
      resolver({ url: 'https://cdn.example.test/chunked', fileName: 'chunked.bin' }),
      async () => path.join(directory, 'chunked.bin'),
      vi.fn(),
      { maximumBytes: 4, fetchMedia: async () => new Response('large', { status: 200 }) },
    )
    await expect(streamed.save({ ...request, operationId: 'media-save-2' })).rejects.toMatchObject({
      code: 'tooLarge',
      retryable: false,
    })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(readdir(directory)).resolves.toEqual([])
  })

  it('aborts explicit cancellation and removes a partially written file', async () => {
    const directory = await temporaryDirectory()
    const destination = path.join(directory, 'cancelled.bin')
    let releaseFirstChunk!: () => void
    const firstChunkWritten = new Promise<void>((resolve) => {
      releaseFirstChunk = resolve
    })
    const fetchMedia = vi.fn<ChannelMediaFetch>(async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('part'))
          init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), {
            once: true,
          })
        },
      })
      return new Response(stream, { status: 200 })
    })
    const service = new ChannelMediaSaveService(
      resolver({ url: 'https://cdn.example.test/cancel', fileName: 'cancelled.bin' }),
      async () => destination,
      (event) => {
        if (event.receivedBytes === 4) releaseFirstChunk()
      },
      { fetchMedia, createId: () => 'fixed' },
    )
    const saving = service.save(request)
    await firstChunkWritten

    service.cancel(request.operationId)

    await expect(saving).resolves.toEqual({ status: 'cancelled' })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(readdir(directory)).resolves.toEqual([])
  })

  it('maps fetch and filesystem publication failures to stable retryable codes', async () => {
    const directory = await temporaryDirectory()
    const downloadFailure = new ChannelMediaSaveService(
      resolver(),
      async () => path.join(directory, 'network.png'),
      vi.fn(),
      { fetchMedia: async () => Promise.reject(new Error('secret network detail')) },
    )
    await expect(downloadFailure.save(request)).rejects.toMatchObject({
      code: 'downloadFailed',
      retryable: true,
      message: 'downloadFailed',
    })

    const writeFailure = new ChannelMediaSaveService(
      resolver(),
      async () => path.join(directory, 'write.png'),
      vi.fn(),
      {
        fetchMedia: async () => new Response('ok', { status: 200 }),
        fileSystem: {
          rename: async () => Promise.reject(new Error('secret destination detail')),
        },
        createId: () => 'fixed',
      },
    )
    await expect(
      writeFailure.save({ ...request, operationId: 'media-save-2' }),
    ).rejects.toMatchObject({ code: 'writeFailed', retryable: true, message: 'writeFailed' })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(readdir(directory)).resolves.toEqual([])
  })

  it('aborts all active operations during disposal', async () => {
    let resolveSelection!: (value: string | null) => void
    const selection = new Promise<string | null>((resolve) => {
      resolveSelection = resolve
    })
    const service = new ChannelMediaSaveService(resolver(), () => selection, vi.fn())
    const saving = service.save(request)

    const disposing = service.dispose()
    resolveSelection('/unused')

    await expect(saving).resolves.toEqual({ status: 'cancelled' })
    await disposing
  })
})
