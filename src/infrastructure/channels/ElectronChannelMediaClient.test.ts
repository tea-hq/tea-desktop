import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChannelMediaSaveProgressEvent } from '@/features/channels/contracts'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}))

vi.mock('../electronBridge', () => mocks)

import { ElectronChannelMediaClient } from './ElectronChannelMediaClient'

describe('ElectronChannelMediaClient', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.listen.mockReset()
    mocks.listen.mockResolvedValue(() => undefined)
  })

  it('subscribes before saving and routes progress by operation id', async () => {
    let eventListener: ((event: { payload: ChannelMediaSaveProgressEvent }) => void) | undefined
    mocks.listen.mockImplementation((_event, listener) => {
      eventListener = listener
      return Promise.resolve(() => undefined)
    })
    let resolveSave!: (value: unknown) => void
    mocks.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )
    const client = new ElectronChannelMediaClient()
    const progress = vi.fn()
    const request = {
      operationId: 'media-save-1',
      messageRef: { channelRef: 'product', messageClientId: 'image-1' },
    }

    const saving = client.save(request, progress)
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalled())
    eventListener?.({
      payload: {
        operationId: 'other-operation',
        phase: 'saving',
        receivedBytes: 4,
        totalBytes: 42,
      },
    })
    eventListener?.({
      payload: {
        operationId: request.operationId,
        phase: 'saving',
        receivedBytes: 8,
        totalBytes: 42,
      },
    })
    resolveSave({ status: 'saved', fileName: 'design.png', byteLength: 42 })

    await expect(saving).resolves.toEqual({
      status: 'saved',
      fileName: 'design.png',
      byteLength: 42,
    })
    expect(progress).toHaveBeenCalledWith({
      operationId: request.operationId,
      phase: 'saving',
      receivedBytes: 8,
      totalBytes: 42,
    })
    expect(mocks.listen).toHaveBeenCalledWith('channel-media-save-progress', expect.any(Function))
    expect(mocks.invoke).toHaveBeenCalledWith('save_channel_media', { request })
  })

  it('normalizes stable failures and rejects malformed results', async () => {
    const client = new ElectronChannelMediaClient()
    const request = {
      operationId: 'media-save-2',
      messageRef: { channelRef: 'product', messageClientId: 'video-1' },
    }
    mocks.invoke.mockRejectedValueOnce({ code: 'downloadFailed', retryable: true })

    await expect(client.save(request, vi.fn())).rejects.toMatchObject({
      name: 'ChannelMediaClientError',
      code: 'downloadFailed',
      retryable: true,
    })

    mocks.invoke.mockResolvedValueOnce({ status: 'saved', fileName: '', byteLength: -1 })
    await expect(
      client.save({ ...request, operationId: 'media-save-3' }, vi.fn()),
    ).rejects.toMatchObject({ code: 'unknown', retryable: true })
  })

  it('cancels each operation once and disposes its shared subscription', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    mocks.invoke.mockResolvedValue(undefined)
    const client = new ElectronChannelMediaClient()
    const request = {
      operationId: 'media-save-4',
      messageRef: { channelRef: 'product', messageClientId: 'file-1' },
    }
    mocks.invoke.mockResolvedValueOnce({ status: 'cancelled' })

    await client.save(request, vi.fn())
    await client.cancel(request.operationId)
    await client.cancel(request.operationId)
    await client.dispose()
    await client.dispose()

    expect(mocks.invoke.mock.calls).toEqual([
      ['save_channel_media', { request }],
      ['cancel_channel_media_save', { operationId: request.operationId }],
    ])
    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
