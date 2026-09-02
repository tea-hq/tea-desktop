import { describe, expect, it, vi } from 'vitest'

import { ChannelMediaClientError } from '@/features/channels/contracts'
import { MockChannelMediaClient } from './MockChannelMediaClient'

describe('MockChannelMediaClient', () => {
  it('records cloned requests and supports deterministic progress and completion', async () => {
    const client = new MockChannelMediaClient()
    const progress = vi.fn()
    const request = {
      operationId: 'media-save-1',
      messageRef: { channelRef: 'product', messageClientId: 'image-1' },
    }

    const saving = client.save(request, progress)
    request.messageRef.messageClientId = 'mutated'
    client.emit({
      operationId: request.operationId,
      phase: 'saving',
      receivedBytes: 10,
      totalBytes: 20,
    })
    client.resolve(request.operationId, {
      status: 'saved',
      fileName: 'design.png',
      byteLength: 20,
    })

    await expect(saving).resolves.toEqual({
      status: 'saved',
      fileName: 'design.png',
      byteLength: 20,
    })
    expect(client.requests[0]?.messageRef.messageClientId).toBe('image-1')
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ receivedBytes: 10 }))
  })

  it('cancels idempotently and rejects operations deterministically', async () => {
    const client = new MockChannelMediaClient()
    const first = client.save(
      {
        operationId: 'media-save-2',
        messageRef: { channelRef: 'product', messageClientId: 'video-1' },
      },
      vi.fn(),
    )
    await client.cancel('media-save-2')
    await client.cancel('media-save-2')
    await expect(first).resolves.toEqual({ status: 'cancelled' })
    expect(client.cancelRequests).toEqual(['media-save-2'])

    const second = client.save(
      {
        operationId: 'media-save-3',
        messageRef: { channelRef: 'product', messageClientId: 'file-1' },
      },
      vi.fn(),
    )
    client.reject('media-save-3', new ChannelMediaClientError('writeFailed', true))
    await expect(second).rejects.toMatchObject({ code: 'writeFailed', retryable: true })
  })

  it('rejects duplicate operations and cancels pending work on dispose', async () => {
    const client = new MockChannelMediaClient()
    const request = {
      operationId: 'media-save-4',
      messageRef: { channelRef: 'product', messageClientId: 'file-2' },
    }
    const saving = client.save(request, vi.fn())

    await expect(client.save(request, vi.fn())).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
    await client.dispose()
    await expect(saving).resolves.toEqual({ status: 'cancelled' })
  })
})
