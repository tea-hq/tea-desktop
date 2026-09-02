import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
}))

vi.mock('../electronBridge', () => ({ listen: mocks.listen }))

import {
  ElectronChannelNotificationClient,
  NoopChannelNotificationClient,
} from './ElectronChannelNotificationClient'

describe('ElectronChannelNotificationClient', () => {
  beforeEach(() => {
    mocks.listen.mockReset()
  })

  it('subscribes through the allowlisted event and drops malformed message refs', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    const client = new ElectronChannelNotificationClient()
    const listener = vi.fn()
    client.subscribe(listener)
    await Promise.resolve()

    const forward = mocks.listen.mock.calls[0]?.[1]
    expect(mocks.listen).toHaveBeenCalledWith(
      'channel-notification-activated',
      expect.any(Function),
    )

    forward({
      payload: {
        channelRef: 'product',
        messageClientId: 'message-1',
        messageServerId: 'server-1',
      },
    })
    for (const payload of [
      null,
      [],
      { channelRef: '', messageClientId: 'message-2' },
      { channelRef: 'product', messageClientId: 'message-3\n' },
      { channelRef: 'product', messageClientId: 'message-4', messageServerId: 4 },
      { channelRef: 'product', messageClientId: 'message-5', messageServerId: '' },
    ])
      forward({ payload })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      channelRef: 'product',
      messageClientId: 'message-1',
      messageServerId: 'server-1',
    })

    await client.dispose()
    expect(unlisten).toHaveBeenCalledOnce()
    forward({ payload: { channelRef: 'product', messageClientId: 'message-6' } })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('supports deterministic listener disposal and no-op preview behavior', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    const client = new ElectronChannelNotificationClient()
    const listener = vi.fn()
    const disposeListener = client.subscribe(listener)
    disposeListener()
    const forward = mocks.listen.mock.calls[0]?.[1]
    forward({ payload: { channelRef: 'product', messageClientId: 'message-1' } })
    expect(listener).not.toHaveBeenCalled()
    await client.dispose()
    await client.dispose()
    expect(unlisten).toHaveBeenCalledOnce()

    const preview = new NoopChannelNotificationClient()
    const previewListener = vi.fn()
    const disposePreview = preview.subscribe(previewListener)
    disposePreview()
    await preview.dispose()
    expect(previewListener).not.toHaveBeenCalled()
  })
})
