import { describe, expect, it, vi } from 'vitest'

import type { ElectronChannelService } from '../services/channel'
import { createChannelCommandHandlers } from './channelCommands'

function channelService(): ElectronChannelService {
  return {
    setChannelPinned: vi.fn(async () => undefined),
    setChannelMuted: vi.fn(async () => undefined),
    setPresenceSubscriptions: vi.fn(async () => undefined),
    hideChannel: vi.fn(async () => undefined),
    releaseAttachment: vi.fn(async () => undefined),
  } as never
}

describe('channel command handlers', () => {
  it('validates and delegates provider-neutral conversation controls', async () => {
    const channel = channelService()
    const handlers = createChannelCommandHandlers({ channel }).handlers

    await handlers.set_channel_pinned!({ channelRef: 'channel', pinned: true })
    await handlers.set_channel_muted!({ channelRef: 'channel', muted: false })
    await handlers.hide_channel!({ channelRef: 'channel' })

    expect(channel.setChannelPinned).toHaveBeenCalledWith('channel', true)
    expect(channel.setChannelMuted).toHaveBeenCalledWith('channel', false)
    expect(channel.hideChannel).toHaveBeenCalledWith('channel')
  })

  it('rejects malformed flags before delegation', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers({ channel }).handlers.set_channel_muted!

    await expect(
      Promise.resolve().then(() => handler({ channelRef: 'channel', muted: 'yes' })),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    expect(channel.setChannelMuted).not.toHaveBeenCalled()
  })

  it('validates and delegates a bounded presence replace set', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers({ channel }).handlers
      .set_channel_presence_subscriptions!

    await handler({ accountIds: ['lin', 'meng'] })

    expect(channel.setPresenceSubscriptions).toHaveBeenCalledWith(['lin', 'meng'])
  })

  it('rejects malformed or unbounded presence payloads before delegation', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers({ channel }).handlers
      .set_channel_presence_subscriptions!

    for (const accountIds of [
      'lin',
      [''],
      ['line\nbreak'],
      ['x'.repeat(513)],
      Array.from({ length: 3_001 }, (_, index) => `account-${index}`),
    ]) {
      await expect(Promise.resolve().then(() => handler({ accountIds }))).rejects.toMatchObject({
        code: 'invalidRequest',
        retryable: false,
      })
    }
    expect(channel.setPresenceSubscriptions).not.toHaveBeenCalled()
  })

  it('allows only a validated opaque attachment token across the release boundary', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers({ channel }).handlers.release_channel_attachment!

    await handler({ token: 'file:opaque' })
    expect(channel.releaseAttachment).toHaveBeenCalledWith('file:opaque')

    await expect(Promise.resolve().then(() => handler({ token: '' }))).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
  })
})
