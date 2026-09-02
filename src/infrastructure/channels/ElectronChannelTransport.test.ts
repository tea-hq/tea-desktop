import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn().mockResolvedValue(() => undefined),
}))

vi.mock('../electronBridge', () => ({ invoke: mocks.invoke, listen: mocks.listen }))

import { ElectronChannelTransport } from './ElectronChannelTransport'

describe('ElectronChannelTransport', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.listen.mockClear()
  })

  it('connects through Host status without passing credentials from the WebView', async () => {
    mocks.invoke.mockResolvedValueOnce({
      phase: 'connected',
      account: 'account',
      accountRef: 'safe-ref',
      retryable: false,
    })
    const transport = new ElectronChannelTransport()

    await transport.connect()

    expect(mocks.invoke).toHaveBeenCalledWith('get_channel_status')
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(/token|appKey|apiKey/i)
    expect(transport.status().phase).toBe('connected')
    await transport.dispose()
  })

  it('loads self profile through the Electron host without exposing credentials', async () => {
    mocks.invoke.mockResolvedValueOnce({
      accountId: 'account',
      name: 'Tea User',
      email: 'user@example.test',
    })
    const transport = new ElectronChannelTransport()

    expect(transport.capabilities()).toContainEqual({
      id: 'profile.self',
      available: true,
    })
    await expect(transport.getSelfProfile()).resolves.toEqual({
      accountId: 'account',
      name: 'Tea User',
      email: 'user@example.test',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('get_channel_self_profile', {})
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(/token|appKey|apiKey/i)
    await transport.dispose()
  })

  it('advertises the complete provider-neutral mutation surface', async () => {
    const capabilityIds = new Set(
      new ElectronChannelTransport().capabilities().map((value) => value.id),
    )

    expect([...capabilityIds]).toEqual(
      expect.arrayContaining([
        'message.send.media',
        'message.reply',
        'message.forward',
        'message.modify',
        'message.delete',
        'message.revoke',
        'message.pin',
        'message.save',
        'message.save.list',
        'message.quickComment',
        'message.receipt.details',
        'channel.manage',
        'channel.pin',
        'channel.mute',
        'channel.hide',
      ]),
    )
  })

  it('searches messages through an allowlisted Electron command', async () => {
    mocks.invoke.mockResolvedValueOnce({ items: [], totalCount: 0, hasMore: false })
    const transport = new ElectronChannelTransport()

    await expect(
      transport.searchMessages({ channelRef: 'channel', keyword: 'Agent', limit: 20 }),
    ).resolves.toEqual({ items: [], totalCount: 0, hasMore: false })
    expect(mocks.invoke).toHaveBeenCalledWith('search_channel_messages', {
      request: { channelRef: 'channel', keyword: 'Agent', limit: 20 },
    })
    await transport.dispose()
  })

  it('lists pinned messages through the Electron boundary', async () => {
    mocks.invoke.mockResolvedValueOnce([])
    const transport = new ElectronChannelTransport()

    await expect(transport.listPinnedMessages('channel')).resolves.toEqual([])
    expect(mocks.invoke).toHaveBeenCalledWith('list_pinned_channel_messages', {
      channelRef: 'channel',
    })
    await transport.dispose()
  })

  it('invokes the complete saved-message command boundary', async () => {
    const saved = {
      id: 'saved-1',
      message: { ref: { channelRef: 'channel', messageClientId: 'message-1' } },
      savedAt: 1,
    }
    mocks.invoke.mockResolvedValueOnce(saved).mockResolvedValueOnce({
      items: [saved],
      totalCount: 1,
      hasMore: false,
    })
    const transport = new ElectronChannelTransport()

    await expect(
      transport.saveMessage({
        messageRef: { channelRef: 'channel', messageClientId: 'message-1' },
        sourceChannelName: 'Product',
      }),
    ).resolves.toEqual(saved)
    await expect(transport.listSavedMessages({ limit: 20 })).resolves.toMatchObject({
      totalCount: 1,
    })
    await transport.removeSavedMessage('saved-1')

    expect(mocks.invoke.mock.calls).toEqual([
      [
        'save_channel_message',
        {
          request: {
            messageRef: { channelRef: 'channel', messageClientId: 'message-1' },
            sourceChannelName: 'Product',
          },
        },
      ],
      ['list_saved_channel_messages', { request: { limit: 20 } }],
      ['remove_saved_channel_message', { savedMessageId: 'saved-1' }],
    ])
    await transport.dispose()
  })

  it('forwards multiple messages and loads merged history through allowlisted commands', async () => {
    const messageRef = { channelRef: 'source', messageClientId: 'message-1' }
    const request = {
      messageRefs: [messageRef],
      targetChannelRefs: ['target'],
      mode: 'merged' as const,
      sourceChannelName: 'Source',
    }
    mocks.invoke.mockResolvedValueOnce({ messages: [] }).mockResolvedValueOnce([])
    const transport = new ElectronChannelTransport()

    await expect(transport.forwardMessage(request)).resolves.toEqual({ messages: [] })
    await expect(transport.loadMergedMessages(messageRef)).resolves.toEqual([])
    expect(mocks.invoke.mock.calls).toEqual([
      ['forward_channel_message', { request }],
      ['load_merged_channel_messages', { messageRef }],
    ])
    await transport.dispose()
  })

  it('loads receipt details through the allowlisted Electron boundary', async () => {
    const messageRef = { channelRef: 'team', messageClientId: 'message-1' }
    const details = {
      messageRef,
      read: [],
      unread: [],
      readCount: 0,
      unreadCount: 0,
    }
    mocks.invoke.mockResolvedValueOnce(details)
    const transport = new ElectronChannelTransport()

    await expect(transport.getMessageReceiptDetails(messageRef)).resolves.toEqual(details)
    expect(mocks.invoke).toHaveBeenCalledWith('get_channel_message_receipt_details', { messageRef })
    await transport.dispose()
  })

  it('invokes the complete conversation-control command boundary', async () => {
    mocks.invoke.mockResolvedValue(undefined)
    const transport = new ElectronChannelTransport()

    await transport.setChannelPinned('channel', true)
    await transport.setChannelMuted('channel', false)
    await transport.hideChannel('channel')

    expect(mocks.invoke.mock.calls).toEqual([
      ['set_channel_pinned', { channelRef: 'channel', pinned: true }],
      ['set_channel_muted', { channelRef: 'channel', muted: false }],
      ['hide_channel', { channelRef: 'channel' }],
    ])
    await transport.dispose()
  })
})
