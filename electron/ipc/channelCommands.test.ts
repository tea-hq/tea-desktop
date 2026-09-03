import { describe, expect, it, vi } from 'vitest'

import type { ElectronChannelService } from '../services/channel'
import type { ChannelMediaSaveService } from '../services/channelMedia'
import { createChannelCommandHandlers } from './channelCommands'

function channelService(): ElectronChannelService {
  return {
    setChannelPinned: vi.fn(async () => undefined),
    setChannelMuted: vi.fn(async () => undefined),
    setPresenceSubscriptions: vi.fn(async () => undefined),
    transcribeVoice: vi.fn(async () => 'Review the release plan.'),
    loadThread: vi.fn(async () => ({
      channelRef: 'channel',
      root: { ref: { channelRef: 'channel', messageClientId: 'root' } },
      replies: [],
      replyCount: 0,
      updatedAt: 1,
    })),
    hideChannel: vi.fn(async () => undefined),
    releaseAttachment: vi.fn(async () => undefined),
  } as never
}

function mediaService(): ChannelMediaSaveService {
  return {
    save: vi.fn(async () => ({ status: 'cancelled' })),
    cancel: vi.fn(),
  } as never
}

function commandServices(channel = channelService(), channelMedia = mediaService()) {
  return { channel, channelMedia }
}

describe('channel command handlers', () => {
  it('validates and delegates provider-neutral conversation controls', async () => {
    const channel = channelService()
    const handlers = createChannelCommandHandlers(commandServices(channel)).handlers

    await handlers.set_channel_pinned!({ channelRef: 'channel', pinned: true })
    await handlers.set_channel_muted!({ channelRef: 'channel', muted: false })
    await handlers.hide_channel!({ channelRef: 'channel' })

    expect(channel.setChannelPinned).toHaveBeenCalledWith('channel', true)
    expect(channel.setChannelMuted).toHaveBeenCalledWith('channel', false)
    expect(channel.hideChannel).toHaveBeenCalledWith('channel')
  })

  it('rejects malformed flags before delegation', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
      .set_channel_muted!

    await expect(
      Promise.resolve().then(() => handler({ channelRef: 'channel', muted: 'yes' })),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    expect(channel.setChannelMuted).not.toHaveBeenCalled()
  })

  it('validates and delegates a bounded presence replace set', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
      .set_channel_presence_subscriptions!

    await handler({ accountIds: ['lin', 'meng'] })

    expect(channel.setPresenceSubscriptions).toHaveBeenCalledWith(['lin', 'meng'])
  })

  it('rejects malformed or unbounded presence payloads before delegation', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
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
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
      .release_channel_attachment!

    await handler({ token: 'file:opaque' })
    expect(channel.releaseAttachment).toHaveBeenCalledWith('file:opaque')

    await expect(Promise.resolve().then(() => handler({ token: '' }))).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
  })

  it('validates voice message identity and bounds the delegated transcript', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
      .transcribe_channel_voice!
    const messageRef = {
      channelRef: 'channel',
      messageClientId: 'voice-client',
      messageServerId: 'voice-server',
    }

    await expect(handler({ messageRef })).resolves.toBe('Review the release plan.')
    expect(channel.transcribeVoice).toHaveBeenCalledWith(messageRef)

    for (const invalid of [
      null,
      {},
      { channelRef: 'channel', messageClientId: '' },
      { channelRef: 'channel\n', messageClientId: 'voice-client' },
      { channelRef: 'channel', messageClientId: 'x'.repeat(513) },
    ]) {
      await expect(
        Promise.resolve().then(() => handler({ messageRef: invalid })),
      ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    }
  })

  it('validates and delegates a message-scoped thread load', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
      .load_channel_thread!
    const messageRef = { channelRef: 'channel', messageClientId: 'root-client' }

    await expect(handler({ messageRef })).resolves.toMatchObject({ replyCount: 0 })
    expect(channel.loadThread).toHaveBeenCalledWith(messageRef)
    await expect(
      Promise.resolve().then(() =>
        handler({ messageRef: { channelRef: 'channel', messageClientId: '' } }),
      ),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
  })

  it('fails closed when the service returns an invalid voice transcript', async () => {
    const channel = channelService()
    const handler = createChannelCommandHandlers(commandServices(channel)).handlers
      .transcribe_channel_voice!
    vi.mocked(channel.transcribeVoice)
      .mockResolvedValueOnce(' ')
      .mockResolvedValueOnce('x'.repeat(32_769))

    for (let index = 0; index < 2; index += 1) {
      await expect(
        handler({ messageRef: { channelRef: 'channel', messageClientId: 'voice-client' } }),
      ).rejects.toMatchObject({ code: 'protocolFailure', retryable: false })
    }
  })

  it('validates and delegates media save operations without accepting a URL', async () => {
    const channelMedia = mediaService()
    const handlers = createChannelCommandHandlers(
      commandServices(channelService(), channelMedia),
    ).handlers
    const mediaRequest = {
      operationId: 'media-save:1',
      messageRef: {
        channelRef: 'channel',
        messageClientId: 'image-client',
        messageServerId: 'image-server',
      },
    }

    await handlers.save_channel_media!({ request: mediaRequest })
    await handlers.cancel_channel_media_save!({ operationId: mediaRequest.operationId })

    expect(channelMedia.save).toHaveBeenCalledWith(mediaRequest)
    expect(channelMedia.cancel).toHaveBeenCalledWith(mediaRequest.operationId)
    expect(JSON.stringify(vi.mocked(channelMedia.save).mock.calls)).not.toContain('url')

    for (const invalid of [
      { ...mediaRequest, operationId: '' },
      { ...mediaRequest, operationId: 'with space' },
      { ...mediaRequest, operationId: 'x'.repeat(129) },
      { ...mediaRequest, messageRef: { channelRef: 'channel', messageClientId: '' } },
      { ...mediaRequest, messageRef: { channelRef: 'channel\n', messageClientId: 'image' } },
    ]) {
      await expect(
        Promise.resolve().then(() => handlers.save_channel_media!({ request: invalid })),
      ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    }
    expect(channelMedia.save).toHaveBeenCalledTimes(1)
  })
})
