import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockChannelTransport } from '@/infrastructure/channels/MockChannelTransport'
import { ChannelTransportError } from './contracts'
import { useChannelsStore } from './store'

async function connectedStore() {
  const transport = new MockChannelTransport()
  const store = useChannelsStore()
  store.configure(transport)
  await store.connect()
  return { store, transport }
}

describe('useChannelsStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the catalog without selecting a Channel', async () => {
    const { store } = await connectedStore()
    expect(store.channels.length).toBeGreaterThan(0)
    expect(store.activeChannelRef).toBeNull()
    expect(store.status.accountRef).toMatch(/^[a-f0-9]{64}$/)
  })

  it('sorts pinned conversations before recency and applies explicit controls', async () => {
    const { store, transport } = await connectedStore()
    const currentPinned = store.channels.find((channel) => channel.pinned)!
    await store.setChannelPinned(currentPinned.ref, false)
    const pinned = store.channels.at(-1)!

    await store.setChannelPinned(pinned.ref, true)
    expect(transport.capabilities()).toContainEqual({ id: 'channel.pin', available: true })
    expect(store.channels[0]).toMatchObject({ ref: pinned.ref, pinned: true })

    await store.setChannelMuted(pinned.ref, true)
    expect(store.channels.find((channel) => channel.ref === pinned.ref)?.muted).toBe(true)

    await store.selectChannel(pinned.ref)
    await store.hideChannel(pinned.ref)
    expect(store.channels.some((channel) => channel.ref === pinned.ref)).toBe(false)
    expect(store.activeChannelRef).toBeNull()
  })

  it('preserves conversation state when a control operation fails', async () => {
    const { store, transport } = await connectedStore()
    const channel = store.channels[0]!
    vi.spyOn(transport, 'setChannelMuted').mockRejectedValueOnce(
      new ChannelTransportError('transport', true),
    )

    await expect(store.setChannelMuted(channel.ref, !channel.muted)).rejects.toMatchObject({
      code: 'transport',
    })

    expect(store.channels.find((candidate) => candidate.ref === channel.ref)?.muted).toBe(
      channel.muted,
    )
    expect(store.errorCode).toBe('transport')
  })

  it('keeps an initial empty catalog loading until conversation sync finishes', async () => {
    const transport = new MockChannelTransport()
    const listChannels = vi.spyOn(transport, 'listChannels')
    const synchronizedPage = await transport
      .connect()
      .then(() => transport.listChannels({ offset: 0, limit: 100 }))
    await transport.disconnect()
    let synchronized = false
    listChannels.mockImplementation(async () =>
      synchronized
        ? structuredClone(synchronizedPage)
        : { items: [], nextOffset: 0, hasMore: false },
    )
    const store = useChannelsStore()
    store.configure(transport)

    await store.connect()

    expect(store.channels).toEqual([])
    expect(store.loadingChannels).toBe(true)

    synchronized = true
    transport.emitForTest({ type: 'sync.finished' })
    await vi.waitFor(() => expect(store.channels.length).toBeGreaterThan(0))
    expect(store.loadingChannels).toBe(false)
  })

  it('settles on a real empty catalog after conversation sync finishes', async () => {
    const transport = new MockChannelTransport()
    vi.spyOn(transport, 'listChannels').mockResolvedValue({
      items: [],
      nextOffset: 0,
      hasMore: false,
    })
    const store = useChannelsStore()
    store.configure(transport)
    await store.connect()
    expect(store.loadingChannels).toBe(true)

    transport.emitForTest({ type: 'sync.finished' })

    await vi.waitFor(() => expect(store.loadingChannels).toBe(false))
    expect(store.channels).toEqual([])

    await store.connect()
    expect(store.loadingChannels).toBe(false)
  })

  it('loads normalized messages and marks an explicit selection read', async () => {
    const { store, transport } = await connectedStore()
    const markRead = vi.spyOn(transport, 'markRead')
    await store.selectChannel('product-collab')
    expect(store.activeMessages.length).toBeGreaterThan(0)
    expect(markRead).toHaveBeenCalledWith('product-collab')
  })

  it('keeps before and after cursors independent while loading a message window', async () => {
    const { store, transport } = await connectedStore()
    const originalLoadMessages = transport.loadMessages.bind(transport)
    const initial = await originalLoadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 50,
    })
    const older = {
      ...initial.items[0]!,
      ref: {
        channelRef: 'product-collab',
        messageClientId: 'm-099',
        messageServerId: 's-099',
      },
      sentAt: initial.items[0]!.sentAt - 1,
      text: 'older',
    }
    const newer = {
      ...initial.items.at(-1)!,
      ref: {
        channelRef: 'product-collab',
        messageClientId: 'm-106',
        messageServerId: 's-106',
      },
      sentAt: initial.items.at(-1)!.sentAt + 1,
      text: 'newer',
    }
    vi.spyOn(transport, 'loadMessages').mockImplementation(async (request) => {
      if (request.direction === 'before' && !request.anchorMessage)
        return { ...initial, hasMore: true, nextAnchor: initial.items[0]!.ref }
      if (request.direction === 'before')
        return {
          channelRef: request.channelRef,
          items: [older],
          hasMore: false,
          nextAnchor: older.ref,
        }
      expect(request.direction).toBe('after')
      expect(request.anchorMessage).toEqual(initial.items.at(-1)!.ref)
      return {
        channelRef: request.channelRef,
        items: [newer],
        hasMore: false,
        nextAnchor: newer.ref,
      }
    })

    await store.selectChannel('product-collab')
    await store.loadOlderMessages()
    expect(store.activeHasMoreMessages).toBe(false)

    await store.loadNewerMessages(true)
    expect(store.activeMessages.map((message) => message.ref.messageClientId)).toEqual([
      'm-099',
      'm-101',
      'm-102',
      'm-103',
      'm-104',
      'm-105',
      'm-106',
    ])
    expect(store.activeHasMoreMessages).toBe(false)
  })

  it('reanchors pagination when a cursor message is deleted', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const latest = store.activeMessages.at(-1)!
    const latestRef = JSON.parse(JSON.stringify(latest.ref))
    transport.emitForTest({ type: 'message.deleted', refs: [latestRef] })
    const reanchored = store.activeMessages.at(-1)!.ref

    const loadMessages = vi.spyOn(transport, 'loadMessages')
    await store.loadNewerMessages(true)

    expect(loadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'after',
        anchorMessage: reanchored,
      }),
    )
  })

  it('does not skip a channel selected while another history request is pending', async () => {
    const { store, transport } = await connectedStore()
    const originalLoadMessages = transport.loadMessages.bind(transport)
    const requestedChannels: string[] = []
    let releaseFirst!: () => void
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    vi.spyOn(transport, 'loadMessages').mockImplementation(async (request) => {
      requestedChannels.push(request.channelRef)
      if (request.channelRef === 'product-collab') await firstRequest
      return originalLoadMessages(request)
    })

    const firstSelection = store.selectChannel('product-collab')
    await vi.waitFor(() => expect(requestedChannels).toContain('product-collab'))

    const secondSelection = store.selectChannel('runtime-architecture')
    await vi.waitFor(() => expect(requestedChannels).toContain('runtime-architecture'))
    expect(store.activeChannelRef).toBe('runtime-architecture')

    releaseFirst()
    await Promise.all([firstSelection, secondSelection])

    expect(store.activeChannelRef).toBe('runtime-architecture')
    expect(store.activeMessages).toEqual([])
  })

  it('does not surface a stale history failure after switching channels', async () => {
    const { store, transport } = await connectedStore()
    const originalLoadMessages = transport.loadMessages.bind(transport)
    const requestedChannels: string[] = []
    let rejectFirst!: (reason?: unknown) => void
    const firstRequest = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    vi.spyOn(transport, 'loadMessages').mockImplementation(async (request) => {
      requestedChannels.push(request.channelRef)
      if (request.channelRef === 'product-collab') await firstRequest
      return originalLoadMessages(request)
    })

    const firstSelection = store.selectChannel('product-collab')
    await vi.waitFor(() => expect(requestedChannels).toContain('product-collab'))
    const secondSelection = store.selectChannel('runtime-architecture')
    await vi.waitFor(() => expect(requestedChannels).toContain('runtime-architecture'))

    rejectFirst(new ChannelTransportError('transport', true))
    const results = await Promise.allSettled([firstSelection, secondSelection])

    expect(results[0].status).toBe('rejected')
    expect(results[1].status).toBe('fulfilled')
    expect(store.activeChannelRef).toBe('runtime-architecture')
    expect(store.errorCode).toBeNull()
  })

  it('merges out-of-order realtime events into the same projection', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const latest = JSON.parse(JSON.stringify(store.activeMessages.at(-1)!))
    transport.emitForTest({ type: 'message.revoked', refs: [latest.ref] })
    transport.emitForTest({
      type: 'message.upserted',
      messages: [{ ...latest, text: 'updated', state: 'active' }],
    })
    expect(store.activeMessages.at(-1)).toMatchObject({ text: 'updated', state: 'active' })
  })

  it('sends through the transport and keeps the provider message identity', async () => {
    const { store } = await connectedStore()
    await store.selectChannel('product-collab')
    const result = await store.sendText('Hello')
    expect(result?.ref.messageServerId).toBeTruthy()
    expect(store.activeMessages.at(-1)?.text).toBe('Hello')
  })

  it('preserves provider-neutral mentions and loads receipt details', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const send = vi.spyOn(transport, 'sendMessage')
    const mentions = [
      {
        target: { kind: 'user' as const, accountId: 'lin' },
        label: '@Lin',
        ranges: [{ start: 0, end: 4 }],
      },
    ]

    const result = await store.sendText('@Lin review this', undefined, mentions)

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ mentions }))
    await expect(store.getMessageReceiptDetails(result!.ref)).resolves.toMatchObject({
      messageRef: result!.ref,
      readCount: 2,
      unreadCount: 2,
    })
  })

  it('searches the active channel and jumps to a result anchor', async () => {
    const { store } = await connectedStore()
    await store.selectChannel('product-collab')

    await store.searchMessages('Agent')

    expect(store.messageSearch.totalCount).toBe(4)
    expect(store.messageSearch.items).toHaveLength(4)
    const target = store.messageSearch.items[0]!
    await store.jumpToMessage(target.ref)
    expect(store.activeChannelRef).toBe('product-collab')
    expect(store.highlightedMessageKey).toBe(
      `product-collab:${target.ref.messageServerId || target.ref.messageClientId}`,
    )
    expect(store.activeMessages).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: target.ref })]),
    )
  })

  it('loads pinned messages and reconciles an unpin event', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const target = store.activeMessages[0]!
    await transport.pinMessage({ messageRef: target.ref, pinned: true })

    await store.loadPinnedMessages()

    expect(store.pinnedMessages).toMatchObject([{ message: { ref: target.ref, pinned: true } }])
    await transport.pinMessage({ messageRef: target.ref, pinned: false })
    expect(store.pinnedMessages).toEqual([])
  })

  it('preserves pin facts when an upsert refreshes pinned message content', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    await store.sendText('pinned by me')
    const target = store.activeMessages.at(-1)!
    await transport.pinMessage({ messageRef: target.ref, pinned: true })
    await store.loadPinnedMessages()

    await transport.modifyMessage({
      messageRef: target.ref,
      text: 'updated pinned message',
    })

    expect(store.pinnedMessages).toMatchObject([
      {
        message: { ref: target.ref, text: 'updated pinned message', pinned: true },
        pinnedByAccountId: 'me',
      },
    ])
  })

  it('saves, reloads, and removes a provider-owned saved message', async () => {
    const { store } = await connectedStore()
    await store.selectChannel('product-collab')
    const target = store.activeMessages[0]!

    await store.saveMessage(target.ref, store.activeChannel?.name)
    expect(store.savedMessages).toMatchObject([
      {
        message: { ref: target.ref },
        sourceChannelName: store.activeChannel?.name,
      },
    ])

    store.clearSavedMessages()
    await store.loadSavedMessages()
    expect(store.savedMessagesTotalCount).toBe(1)
    expect(store.savedMessages[0]?.message.ref).toEqual(target.ref)

    await store.removeSavedMessage(store.savedMessages[0]!.id)
    expect(store.savedMessages).toEqual([])
    expect(store.savedMessagesTotalCount).toBe(0)
  })

  it('deduplicates appended saved-message pages', async () => {
    const { store, transport } = await connectedStore()
    const messagePage = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 2,
    })
    const [firstMessage, secondMessage] = messagePage.items
    const first = {
      id: 'saved-1',
      message: firstMessage!,
      savedAt: 2,
    }
    const second = {
      id: 'saved-2',
      message: secondMessage!,
      savedAt: 1,
    }
    vi.spyOn(transport, 'listSavedMessages')
      .mockResolvedValueOnce({
        items: [first],
        totalCount: 2,
        hasMore: true,
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [{ ...first, savedAt: 3 }, second],
        totalCount: 2,
        hasMore: false,
      })

    await store.loadSavedMessages()
    await store.loadMoreSavedMessages()

    expect(store.savedMessages.map((value) => value.id)).toEqual(['saved-1', 'saved-2'])
    expect(store.savedMessages[0]?.savedAt).toBe(3)
    expect(store.savedMessagesHasMore).toBe(false)
  })

  it('rejects a saved-message response after the account lifecycle is disposed', async () => {
    const { store, transport } = await connectedStore()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(transport, 'listSavedMessages').mockImplementation(async () => {
      await gate
      return { items: [], totalCount: 0, hasMore: false }
    })

    const loading = store.loadSavedMessages()
    await store.dispose()
    release()
    await loading

    expect(store.savedMessages).toEqual([])
    expect(store.loadingSavedMessages).toBe(false)
  })

  it('keeps attachment picking provider-neutral and sends structured media', async () => {
    const transport = new MockChannelTransport()
    const picker = {
      pick: vi.fn(async () => [
        {
          token: 'preview:file-1',
          name: 'design.png',
          mimeType: 'image/png',
          size: 12,
          extension: 'png',
          kind: 'image' as const,
        },
      ]),
    }
    const store = useChannelsStore()
    store.configure(transport, picker)
    await store.connect()
    await store.selectChannel('product-collab')

    const [attachment] = await store.pickAttachments()
    await store.sendContent({
      kind: 'image',
      media: { source: { kind: 'localFile', token: attachment!.token }, name: attachment!.name },
    })

    expect(picker.pick).toHaveBeenCalledOnce()
    expect(store.activeMessages.at(-1)?.content).toMatchObject({
      kind: 'image',
      media: { name: 'design.png' },
    })
  })

  it('clears account-scoped projection on kicked-offline and disposes once', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    transport.emitForTest({
      type: 'status.changed',
      status: { phase: 'kickedOffline', retryable: false },
    })
    expect(store.channels).toEqual([])
    expect(store.activeChannelRef).toBeNull()
    await store.dispose()
    await store.dispose()
  })

  it('does not repopulate a disposed tenant from a late catalog response', async () => {
    const transport = new MockChannelTransport()
    const original = transport.listChannels.bind(transport)
    await transport.connect()
    const page = await original({ offset: 0, limit: 100 })
    await transport.disconnect()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const list = vi.spyOn(transport, 'listChannels').mockImplementation(async () => {
      await gate
      return structuredClone(page)
    })
    const store = useChannelsStore()
    store.configure(transport)
    const connecting = store.connect()
    await vi.waitFor(() => expect(list).toHaveBeenCalled())

    const disposing = store.dispose()
    release()
    await Promise.all([connecting, disposing])

    expect(store.channels).toEqual([])
    expect(store.status.phase).toBe('disconnected')
    expect(store.loadingChannels).toBe(false)
  })

  it('forwards an ordered multi-message request and loads its merged snapshot', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const selected = store.activeMessages.slice(0, 2)
    const forward = vi.spyOn(transport, 'forwardMessage')

    const result = await store.forwardMessage({
      messageRefs: selected.map((message) => message.ref),
      targetChannelRefs: ['runtime-architecture'],
      mode: 'merged',
      sourceChannelName: 'Product collaboration',
    })

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'merged',
        messageRefs: selected.map((message) => message.ref),
      }),
    )
    await expect(store.loadMergedMessages(result.messages[0]!.ref)).resolves.toEqual(selected)
    expect(store.loadingMergedMessages).toBe(false)
    expect(store.mergedMessagesErrorCode).toBeNull()
  })

  it('rejects merged-history results from a stale transport lifecycle', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const selected = store.activeMessages[0]!
    const forwarded = await store.forwardMessage({
      messageRefs: [selected.ref],
      targetChannelRefs: ['runtime-architecture'],
      mode: 'merged',
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(transport, 'loadMergedMessages').mockImplementation(async () => {
      await gate
      return structuredClone([selected])
    })

    const loading = store.loadMergedMessages(forwarded.messages[0]!.ref)
    store.configure(new MockChannelTransport())
    release()

    await expect(loading).resolves.toEqual([])
  })
})
