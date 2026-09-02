import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockChannelTransport } from '@/infrastructure/channels/MockChannelTransport'
import { MockChannelVoicePlaybackClient } from '@/infrastructure/channels/MockChannelVoicePlaybackClient'
import type {
  ChannelDraft,
  ChannelDraftClient,
  ChannelVoicePlaybackListener,
  MessageRef,
  SaveChannelDraftRequest,
} from './contracts'
import { ChannelTransportError, ChannelVoicePlaybackClientError } from './contracts'
import { useChannelsStore } from './store'

async function connectedStore(playback?: MockChannelVoicePlaybackClient) {
  const transport = new MockChannelTransport()
  const store = useChannelsStore()
  store.configure(transport, undefined, undefined, playback)
  await store.connect()
  return { store, transport }
}

async function addVoiceMessage(
  store: ReturnType<typeof useChannelsStore>,
  transport: MockChannelTransport,
) {
  await store.selectChannel('product-collab')
  const result = await transport.sendMessage({
    channelRef: 'product-collab',
    content: {
      kind: 'audio',
      caption: 'Release update',
      media: {
        source: { kind: 'localFile', token: 'opaque-voice' },
        name: 'release-update.aac',
        mimeType: 'audio/aac',
        durationMs: 2_400,
      },
    },
  })
  const message = store.activeMessages.find(
    (candidate) => candidate.ref.messageClientId === result.ref.messageClientId,
  )
  if (!message || message.content.kind !== 'audio') throw new Error('voice fixture missing')
  transport.emitForTest({
    type: 'message.upserted',
    messages: [
      {
        ref: { ...message.ref },
        sender: { ...message.sender },
        sentAt: message.sentAt,
        text: message.text,
        content: {
          kind: 'audio',
          ...(message.content.caption ? { caption: message.content.caption } : {}),
          media: {
            ...message.content.media,
            url: `https://media.example.test/${result.ref.messageClientId}.aac`,
          },
        },
        state: message.state,
        sentByCurrentUser: message.sentByCurrentUser,
        pinned: message.pinned,
        reactions: message.reactions.map((reaction) => ({ ...reaction })),
      },
    ],
  })
  return result.ref
}

function createDraftClient(overrides: Partial<ChannelDraftClient> = {}) {
  return {
    list: vi.fn(async (): Promise<ChannelDraft[]> => []),
    save: vi.fn(async (request: SaveChannelDraftRequest): Promise<ChannelDraft> => ({
      ...request,
      mentions: request.mentions.map((mention) => ({
        ...mention,
        target: { ...mention.target },
        ranges: mention.ranges.map((range) => ({ ...range })),
      })),
      updatedAt: 1,
    })),
    remove: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('useChannelsStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the catalog without selecting a Channel', async () => {
    const { store } = await connectedStore()
    expect(store.channels.length).toBeGreaterThan(0)
    expect(store.activeChannelRef).toBeNull()
    expect(store.status.accountRef).toMatch(/^[a-f0-9]{64}$/)
  })

  it('derives presence targets only from direct conversations', async () => {
    const transport = new MockChannelTransport()
    const replace = vi.spyOn(transport, 'setPresenceSubscriptions')
    const store = useChannelsStore()
    store.configure(transport)

    await store.connect()

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(['lin'])
    expect(store.presences).toMatchObject([{ accountId: 'lin', availability: 'online' }])

    await store.selectChannel('lin-direct')
    expect(store.activePresence).toMatchObject({ accountId: 'lin', availability: 'online' })
    await store.selectChannel('product-collab')
    expect(store.activePresence).toBeNull()
  })

  it('replaces presence targets after direct catalog changes without duplicate calls', async () => {
    const { store, transport } = await connectedStore()
    const replace = vi.spyOn(transport, 'setPresenceSubscriptions')

    transport.emitForTest({
      type: 'channel.upserted',
      channels: [
        {
          ref: 'new-group',
          kind: 'group',
          name: 'New group',
          description: '',
          memberCount: 2,
          pinned: false,
          muted: false,
          unreadCount: 0,
          updatedAt: 1,
        },
      ],
    })
    await Promise.resolve()
    expect(replace).not.toHaveBeenCalled()

    transport.emitForTest({
      type: 'channel.upserted',
      channels: [
        {
          ref: 'meng-direct',
          kind: 'direct',
          directAccountId: 'meng',
          name: 'Meng',
          description: '',
          pinned: false,
          muted: false,
          unreadCount: 0,
          updatedAt: 2,
        },
      ],
    })
    await vi.waitFor(() => expect(replace).toHaveBeenLastCalledWith(['lin', 'meng']))
    const callCount = replace.mock.calls.length

    transport.emitForTest({
      type: 'channel.upserted',
      channels: [{ ...store.channels.find((channel) => channel.ref === 'meng-direct')! }],
    })
    await Promise.resolve()
    expect(replace).toHaveBeenCalledTimes(callCount)

    transport.emitForTest({ type: 'channel.deleted', channelRefs: ['lin-direct'] })
    await vi.waitFor(() => expect(replace).toHaveBeenLastCalledWith(['meng']))
  })

  it('projects only desired presence and rejects duplicate or out-of-order updates', async () => {
    const { store, transport } = await connectedStore()
    const initial = store.presences[0]!

    transport.emitForTest({
      type: 'presence.changed',
      presences: [
        { accountId: 'lin', availability: 'offline', updatedAt: initial.updatedAt - 1 },
        { accountId: 'other', availability: 'online', updatedAt: initial.updatedAt + 1 },
      ],
    })
    expect(store.presences).toEqual([initial])

    transport.emitForTest({
      type: 'presence.changed',
      presences: [
        { accountId: 'lin', availability: 'offline', updatedAt: initial.updatedAt + 2 },
        { accountId: 'lin', availability: 'online', updatedAt: initial.updatedAt + 1 },
      ],
    })

    expect(store.presences).toEqual([
      { accountId: 'lin', availability: 'offline', updatedAt: initial.updatedAt + 2 },
    ])
  })

  it('surfaces presence subscription failures and clears them after a retry', async () => {
    const transport = new MockChannelTransport()
    const replace = vi
      .spyOn(transport, 'setPresenceSubscriptions')
      .mockRejectedValueOnce(new ChannelTransportError('transport', true))
    const store = useChannelsStore()
    store.configure(transport)

    await store.connect()

    expect(store.presenceErrorCode).toBe('transport')
    expect(store.presences).toEqual([{ accountId: 'lin', availability: 'unknown', updatedAt: 0 }])
    transport.emitForTest({
      type: 'presence.subscriptionFailed',
      errorCode: 'presenceSubscriptionFailed',
    })
    expect(store.presenceErrorCode).toBe('presenceSubscriptionFailed')

    transport.emitForTest({
      type: 'channel.upserted',
      channels: [{ ...store.channels.find((channel) => channel.ref === 'lin-direct')! }],
    })
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(store.presenceErrorCode).toBeNull())
  })

  it('clears transient presence and resubscribes the same targets after reconnect', async () => {
    const { store, transport } = await connectedStore()
    const replace = vi.spyOn(transport, 'setPresenceSubscriptions')

    transport.emitForTest({
      type: 'status.changed',
      status: { phase: 'reconnecting', retryable: true },
    })
    expect(store.presences).toEqual([{ accountId: 'lin', availability: 'unknown', updatedAt: 0 }])

    transport.emitForTest({
      type: 'status.changed',
      status: { phase: 'connected', accountRef: store.status.accountRef, retryable: false },
    })
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(['lin']))
  })

  it('does not publish a late presence failure after disposal', async () => {
    const transport = new MockChannelTransport()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(transport, 'setPresenceSubscriptions').mockImplementation(async () => {
      await gate
      throw new ChannelTransportError('transport', true)
    })
    const store = useChannelsStore()
    store.configure(transport)
    const connecting = store.connect()
    await vi.waitFor(() => expect(transport.setPresenceSubscriptions).toHaveBeenCalledWith(['lin']))

    const disposing = store.dispose()
    release()
    await Promise.all([connecting, disposing])

    expect(store.presences).toEqual([])
    expect(store.presenceErrorCode).toBeNull()
  })

  it('coalesces concurrent voice transcription and reuses account-scoped success', async () => {
    const { store, transport } = await connectedStore()
    const messageRef = await addVoiceMessage(store, transport)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const transcribe = vi.spyOn(transport, 'transcribeVoice').mockImplementation(async () => {
      await gate
      return 'Review the release plan.'
    })

    const first = store.transcribeVoice(messageRef)
    const second = store.transcribeVoice(structuredClone(messageRef))

    expect(store.activeVoiceTranscripts).toEqual([
      { messageRef, status: 'loading', retryable: false },
    ])
    expect(transcribe).toHaveBeenCalledTimes(1)

    release()
    await Promise.all([first, second])
    expect(store.activeVoiceTranscripts).toEqual([
      {
        messageRef,
        status: 'ready',
        text: 'Review the release plan.',
        retryable: false,
      },
    ])

    await store.selectChannel('runtime-architecture')
    expect(store.activeVoiceTranscripts).toEqual([])
    await store.selectChannel('product-collab')
    await store.transcribeVoice(messageRef)
    expect(transcribe).toHaveBeenCalledTimes(1)
  })

  it('projects retryable voice failures and replaces them after an explicit retry', async () => {
    const { store, transport } = await connectedStore()
    const messageRef = await addVoiceMessage(store, transport)
    vi.spyOn(transport, 'transcribeVoice')
      .mockRejectedValueOnce(new ChannelTransportError('transport', true))
      .mockResolvedValueOnce('Recovered transcript')

    await expect(store.transcribeVoice(messageRef)).rejects.toMatchObject({ code: 'transport' })
    expect(store.activeVoiceTranscripts).toEqual([
      {
        messageRef,
        status: 'failed',
        errorCode: 'transport',
        retryable: true,
      },
    ])

    await store.transcribeVoice(messageRef)
    expect(store.activeVoiceTranscripts).toEqual([
      { messageRef, status: 'ready', text: 'Recovered transcript', retryable: false },
    ])
  })

  it('normalizes synchronous voice transcription failures and permits retry', async () => {
    const { store, transport } = await connectedStore()
    const messageRef = await addVoiceMessage(store, transport)
    vi.spyOn(transport, 'transcribeVoice')
      .mockImplementationOnce(() => {
        throw new ChannelTransportError('transport', true)
      })
      .mockResolvedValueOnce('Recovered after synchronous failure')

    await expect(store.transcribeVoice(messageRef)).rejects.toMatchObject({ code: 'transport' })
    expect(store.activeVoiceTranscripts).toEqual([
      {
        messageRef,
        status: 'failed',
        errorCode: 'transport',
        retryable: true,
      },
    ])

    await store.transcribeVoice(messageRef)
    expect(store.activeVoiceTranscripts).toEqual([
      {
        messageRef,
        status: 'ready',
        text: 'Recovered after synchronous failure',
        retryable: false,
      },
    ])
  })

  it('gates voice transcription by capability and active audio content', async () => {
    const { store, transport } = await connectedStore()
    const messageRef = await addVoiceMessage(store, transport)
    const capabilities = transport
      .capabilities()
      .filter((capability) => capability.id !== 'message.voice.transcribe')
    vi.spyOn(transport, 'capabilities').mockReturnValue(capabilities)
    const transcribe = vi.spyOn(transport, 'transcribeVoice')

    await expect(store.transcribeVoice(messageRef)).rejects.toMatchObject({
      code: 'unsupportedCapability',
      retryable: false,
    })
    await expect(store.transcribeVoice(store.activeMessages[0]!.ref)).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
    expect(transcribe).not.toHaveBeenCalled()
    expect(store.activeVoiceTranscripts).toEqual([])
  })

  it('clears voice transcripts on revoke, delete, and a late account lifecycle result', async () => {
    const { store, transport } = await connectedStore()
    const revokedRef = await addVoiceMessage(store, transport)
    await store.transcribeVoice(revokedRef)
    expect(store.activeVoiceTranscripts).toHaveLength(1)

    await store.revokeMessage(revokedRef)
    expect(store.activeVoiceTranscripts).toEqual([])

    const deletedRef = await addVoiceMessage(store, transport)
    await store.transcribeVoice(deletedRef)
    await store.deleteMessages([deletedRef])
    expect(store.activeVoiceTranscripts).toEqual([])

    const lateRef = await addVoiceMessage(store, transport)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(transport, 'transcribeVoice').mockImplementationOnce(async () => {
      await gate
      return 'Late transcript'
    })
    const loading = store.transcribeVoice(lateRef)
    await vi.waitFor(() => expect(store.activeVoiceTranscripts[0]?.status).toBe('loading'))

    const disposing = store.dispose()
    release()
    await Promise.all([loading, disposing])
    expect(store.activeVoiceTranscripts).toEqual([])
  })

  it('owns voice play, pause, seek, rate, progress, and resume state', async () => {
    const playback = new MockChannelVoicePlaybackClient()
    const { store, transport } = await connectedStore(playback)
    const messageRef = await addVoiceMessage(store, transport)

    await store.toggleVoicePlayback(messageRef)
    expect(store.activeVoicePlaybacks).toEqual([
      {
        messageRef,
        status: 'loading',
        positionMs: 0,
        durationMs: 2_400,
        playbackRate: 1,
        retryable: false,
      },
    ])

    playback.emit({ type: 'playing' })
    playback.emit({ type: 'progress', positionMs: 900, durationMs: 2_400 })
    expect(store.activeVoicePlaybacks[0]).toMatchObject({ status: 'playing', positionMs: 900 })

    store.seekVoicePlayback(messageRef, 1_800)
    store.setVoicePlaybackRate(1.5)
    await store.toggleVoicePlayback(messageRef)
    expect(playback.seekRequests).toEqual([1_800])
    expect(playback.rateRequests).toEqual([1.5])
    expect(store.activeVoicePlaybacks[0]).toMatchObject({
      status: 'paused',
      positionMs: 1_800,
      playbackRate: 1.5,
    })

    await store.toggleVoicePlayback(messageRef)
    expect(playback.requests.at(-1)).toMatchObject({
      messageRef,
      startAtMs: 1_800,
      playbackRate: 1.5,
    })
    playback.emit({ type: 'ended' })
    expect(store.activeVoicePlaybacks[0]).toMatchObject({ status: 'paused', positionMs: 0 })
  })

  it('pauses the previous voice and ignores its late player events', async () => {
    const playback = new MockChannelVoicePlaybackClient()
    const listeners: ChannelVoicePlaybackListener[] = []
    const originalPlay = playback.play.bind(playback)
    vi.spyOn(playback, 'play').mockImplementation(async (request, listener) => {
      listeners.push(listener)
      await originalPlay(request, listener)
    })
    const { store, transport } = await connectedStore(playback)
    const first = await addVoiceMessage(store, transport)
    const second = await addVoiceMessage(store, transport)

    await store.toggleVoicePlayback(first)
    listeners[0]?.({ type: 'playing' })
    listeners[0]?.({ type: 'progress', positionMs: 900, durationMs: 2_400 })
    await store.toggleVoicePlayback(second)
    listeners[1]?.({ type: 'playing' })
    listeners[0]?.({ type: 'progress', positionMs: 2_000, durationMs: 2_400 })

    const firstState = store.activeVoicePlaybacks.find(
      (state) => state.messageRef.messageClientId === first.messageClientId,
    )
    const secondState = store.activeVoicePlaybacks.find(
      (state) => state.messageRef.messageClientId === second.messageClientId,
    )
    expect(firstState).toMatchObject({ status: 'paused', positionMs: 900 })
    expect(secondState).toMatchObject({ status: 'playing', positionMs: 0 })
    expect(playback.stopCount).toBe(1)
  })

  it('projects stable playback failures, retries, and clears deleted or disposed state', async () => {
    const playback = new MockChannelVoicePlaybackClient()
    vi.spyOn(playback, 'play').mockRejectedValueOnce(
      new ChannelVoicePlaybackClientError('blocked', true),
    )
    const { store, transport } = await connectedStore(playback)
    const messageRef = await addVoiceMessage(store, transport)

    await expect(store.toggleVoicePlayback(messageRef)).rejects.toMatchObject({ code: 'blocked' })
    expect(store.activeVoicePlaybacks[0]).toMatchObject({
      status: 'failed',
      errorCode: 'blocked',
      retryable: true,
    })

    await store.retryVoicePlayback(messageRef)
    playback.emit({ type: 'playing' })
    playback.emit({ type: 'failed', errorCode: 'network', retryable: true })
    playback.emit({ type: 'paused' })
    expect(store.activeVoicePlaybacks[0]).toMatchObject({
      status: 'failed',
      errorCode: 'network',
      retryable: true,
    })

    await store.retryVoicePlayback(messageRef)
    playback.emit({ type: 'playing' })
    await store.deleteMessages([messageRef])
    expect(store.activeVoicePlaybacks).toEqual([])
    expect(playback.stopCount).toBeGreaterThan(0)

    const lateRef = await addVoiceMessage(store, transport)
    await store.toggleVoicePlayback(lateRef)
    await store.dispose()
    playback.emit({ type: 'progress', positionMs: 1_000, durationMs: 2_400 })
    expect(store.activeVoicePlaybacks).toEqual([])
  })

  it('bounds account-scoped voice playback bookmarks to 128 messages', async () => {
    const playback = new MockChannelVoicePlaybackClient()
    const { store, transport } = await connectedStore(playback)
    const refs: MessageRef[] = []
    for (let index = 0; index < 129; index += 1) {
      const messageRef = await addVoiceMessage(store, transport)
      refs.push(messageRef)
      await store.toggleVoicePlayback(messageRef)
      playback.emit({ type: 'playing' })
      playback.emit({ type: 'progress', positionMs: index + 1, durationMs: 2_400 })
      await store.toggleVoicePlayback(messageRef)
    }

    expect(store.activeVoicePlaybacks).toHaveLength(128)
    expect(
      store.activeVoicePlaybacks.some(
        (state) => state.messageRef.messageClientId === refs[0]?.messageClientId,
      ),
    ).toBe(false)
    expect(
      store.activeVoicePlaybacks.some(
        (state) => state.messageRef.messageClientId === refs.at(-1)?.messageClientId,
      ),
    ).toBe(true)
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

  it('loads account-scoped drafts after connecting', async () => {
    const transport = new MockChannelTransport()
    const list = vi.fn(async (accountRef: string): Promise<ChannelDraft[]> => [
      {
        accountRef,
        channelRef: 'product-collab',
        text: '@Lin review this',
        mentions: [
          {
            target: { kind: 'user', accountId: 'lin' },
            label: '@Lin',
            ranges: [{ start: 0, end: 4 }],
          },
        ],
        updatedAt: 1,
      },
    ])
    const draftClient = createDraftClient({ list })
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)

    await store.connect()
    await store.selectChannel('product-collab')

    expect(list).toHaveBeenCalledWith(store.status.accountRef)
    expect(store.activeDraft).toMatchObject({ text: '@Lin review this' })
  })

  it('clears the previous draft projection before loading a changed account', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient({
      list: vi.fn(async (accountRef: string): Promise<ChannelDraft[]> => [
        {
          accountRef,
          channelRef: 'product-collab',
          text: accountRef === 'account-b' ? 'Account B draft' : 'Account A draft',
          mentions: [],
          updatedAt: 1,
        },
      ]),
    })
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    expect(store.drafts[0]?.text).toBe('Account A draft')

    transport.emitForTest({
      type: 'status.changed',
      status: { phase: 'connected', accountRef: 'account-b', retryable: false },
    })

    expect(store.drafts).toEqual([])
    await vi.waitFor(() => expect(store.drafts[0]?.text).toBe('Account B draft'))
  })

  it('coalesces draft changes and flushes the latest value on channel switch', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient()
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')

    store.updateDraft('product-collab', 'First', [])
    store.updateDraft('product-collab', 'Latest', [])
    await store.selectChannel('runtime-architecture')

    expect(draftClient.save).toHaveBeenCalledOnce()
    expect(draftClient.save).toHaveBeenCalledWith(
      expect.objectContaining({ channelRef: 'product-collab', text: 'Latest' }),
    )
  })

  it('preserves a failed in-memory draft and retries after later input', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient()
    vi.mocked(draftClient.save).mockRejectedValueOnce({
      code: 'storageFailure',
      retryable: true,
    })
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')

    store.updateDraft('product-collab', 'Keep this', [])
    await expect(store.flushDraft('product-collab')).rejects.toMatchObject({
      code: 'storageFailure',
    })
    expect(store.activeDraft?.text).toBe('Keep this')
    expect(store.draftErrorCode).toBe('storageFailure')

    store.updateDraft('product-collab', 'Keep this updated', [])
    await store.flushDraft('product-collab')
    expect(store.activeDraft?.text).toBe('Keep this updated')
    expect(store.draftErrorCode).toBeNull()
  })

  it('removes a cleared draft durably', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient()
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')
    store.updateDraft('product-collab', 'Sent text', [])
    await store.flushDraft('product-collab')

    await store.clearDraft('product-collab')

    expect(store.activeDraft).toBeNull()
    expect(draftClient.remove).toHaveBeenCalledWith(store.status.accountRef, 'product-collab')
  })

  it('restores the in-memory draft when durable removal fails', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient({
      remove: vi.fn(async () => {
        throw { code: 'storageFailure', retryable: true }
      }),
    })
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')
    store.updateDraft('product-collab', 'Recover this', [])
    await store.flushDraft('product-collab')

    await expect(store.clearDraft('product-collab')).rejects.toMatchObject({
      code: 'storageFailure',
    })

    expect(store.activeDraft?.text).toBe('Recover this')
    expect(store.draftErrorCode).toBe('storageFailure')
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

  it('projects a sending attempt and routes progress by operation id', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const originalSend = transport.sendMessage.bind(transport)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(transport, 'sendMessage').mockImplementation(async (request) => {
      await gate
      return originalSend(request)
    })

    const sending = store.sendText('Queued message')
    const attempt = store.activeOutgoingAttempts[0]!
    expect(attempt).toMatchObject({
      content: { kind: 'text', text: 'Queued message' },
      status: 'sending',
      progress: 0,
      attemptNumber: 1,
    })

    transport.emitForTest({
      type: 'message.sendProgress',
      operationId: attempt.operationId,
      progress: 48,
    })
    expect(store.activeOutgoingAttempts[0]?.progress).toBe(48)

    release()
    await sending
    expect(store.activeOutgoingAttempts).toEqual([])
  })

  it('retries a failed attempt with stable idempotency and a fresh operation id', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    const originalSend = transport.sendMessage.bind(transport)
    const send = vi
      .spyOn(transport, 'sendMessage')
      .mockRejectedValueOnce(new ChannelTransportError('transport', true))
      .mockImplementation(originalSend)

    await expect(store.sendText('Retry this')).rejects.toMatchObject({ code: 'transport' })
    const failed = store.activeOutgoingAttempts[0]!
    expect(failed).toMatchObject({ status: 'failed', retryable: true, errorCode: 'transport' })
    const firstRequest = send.mock.calls[0]![0]

    await store.retryOutgoingMessage(failed.attemptId)

    const secondRequest = send.mock.calls[1]![0]
    expect(secondRequest.idempotencyKey).toBe(firstRequest.idempotencyKey)
    expect(secondRequest.operationId).not.toBe(firstRequest.operationId)
    expect(store.activeOutgoingAttempts).toEqual([])
    expect(store.activeMessages.at(-1)).toMatchObject({
      text: 'Retry this',
      clientReference: firstRequest.idempotencyKey,
    })
  })

  it('keeps a durable composer draft until a failed delivery retry is confirmed', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient()
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')
    const originalSend = transport.sendMessage.bind(transport)
    vi.spyOn(transport, 'sendMessage')
      .mockRejectedValueOnce(new ChannelTransportError('transport', true))
      .mockImplementation(originalSend)

    const submission = await store.beginComposerSubmission({
      text: 'Retry this draft',
      attachments: [],
      mentions: [],
    })
    await submission?.completion

    expect(store.activeDraft?.text).toBe('Retry this draft')
    expect(store.activeDraftHasUnresolvedDelivery).toBe(true)
    expect(draftClient.remove).not.toHaveBeenCalled()

    await store.retryOutgoingMessage(store.activeOutgoingAttempts[0]!.attemptId)

    expect(store.activeDraft).toBeNull()
    expect(store.activeDraftHasUnresolvedDelivery).toBe(false)
    expect(draftClient.remove).toHaveBeenCalledWith(store.status.accountRef, 'product-collab')
  })

  it('clears a durable composer draft after a synchronous provider confirmation', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient()
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')

    const submission = await store.beginComposerSubmission({
      text: 'Confirm immediately',
      attachments: [],
      mentions: [],
    })
    await submission?.completion

    expect(store.activeDraft).toBeNull()
    expect(store.activeDraftHasUnresolvedDelivery).toBe(false)
    expect(draftClient.remove).toHaveBeenCalledWith(store.status.accountRef, 'product-collab')
  })

  it('does not clear edits made after a composer submission starts', async () => {
    const transport = new MockChannelTransport()
    const draftClient = createDraftClient()
    const store = useChannelsStore()
    store.configure(transport, undefined, draftClient)
    await store.connect()
    await store.selectChannel('product-collab')
    const originalSend = transport.sendMessage.bind(transport)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(transport, 'sendMessage').mockImplementationOnce(async (request) => {
      await gate
      return originalSend(request)
    })

    const submission = await store.beginComposerSubmission({
      text: 'First draft',
      attachments: [],
      mentions: [],
    })
    expect(store.activeDraftHasUnresolvedDelivery).toBe(true)
    store.updateDraft('product-collab', 'A new draft', [])
    release()
    await submission?.completion

    expect(store.activeDraft?.text).toBe('A new draft')
    expect(store.activeDraftHasUnresolvedDelivery).toBe(false)
  })

  it('keeps a non-retryable failure visible until it is dismissed', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    vi.spyOn(transport, 'sendMessage').mockRejectedValueOnce(
      new ChannelTransportError('invalidRequest', false),
    )

    await expect(store.sendText('Invalid')).rejects.toMatchObject({ code: 'invalidRequest' })
    const failed = store.activeOutgoingAttempts[0]!
    expect(failed).toMatchObject({ status: 'failed', retryable: false })
    await expect(store.retryOutgoingMessage(failed.attemptId)).resolves.toBeNull()

    await store.dismissOutgoingMessage(failed.attemptId)
    expect(store.activeOutgoingAttempts).toEqual([])
  })

  it('preserves cancelled state when the original send rejects late', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    let rejectSend!: (error: unknown) => void
    vi.spyOn(transport, 'sendMessage').mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSend = reject
        }),
    )
    const cancel = vi.spyOn(transport, 'cancelMessageSend')

    const sending = store.sendText('Cancel this')
    const attempt = store.activeOutgoingAttempts[0]!
    await store.cancelOutgoingMessage(attempt.attemptId)
    expect(cancel).toHaveBeenCalledWith(attempt.operationId)
    expect(store.activeOutgoingAttempts[0]).toMatchObject({
      status: 'cancelled',
      retryable: true,
    })

    rejectSend(new ChannelTransportError('transport', true))
    await expect(sending).rejects.toMatchObject({ code: 'transport' })
    expect(store.activeOutgoingAttempts[0]?.status).toBe('cancelled')
  })

  it('reconciles an uncertain failure from a provider message event', async () => {
    const { store, transport } = await connectedStore()
    await store.selectChannel('product-collab')
    let rejectSend!: (error: unknown) => void
    vi.spyOn(transport, 'sendMessage').mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSend = reject
        }),
    )

    const sending = store.sendText('Eventually confirmed')
    const attempt = store.activeOutgoingAttempts[0]!
    const template = store.activeMessages.at(-1)!
    transport.emitForTest({
      type: 'message.upserted',
      messages: [
        {
          ...(JSON.parse(JSON.stringify(template)) as typeof template),
          ref: {
            channelRef: 'product-collab',
            messageClientId: 'confirmed-client',
            messageServerId: 'confirmed-server',
          },
          text: 'Eventually confirmed',
          content: { kind: 'text', text: 'Eventually confirmed' },
          sentByCurrentUser: true,
          clientReference: attempt.idempotencyKey,
        },
      ],
    })
    expect(store.activeOutgoingAttempts).toEqual([])

    rejectSend(new ChannelTransportError('transport', true))
    await expect(sending).rejects.toMatchObject({ code: 'transport' })
    expect(store.activeOutgoingAttempts).toEqual([])
  })

  it('retains a media handle on failure and releases it after confirmed retry', async () => {
    const transport = new MockChannelTransport()
    const picker = {
      pick: vi.fn(async () => []),
      release: vi.fn(async () => undefined),
    }
    const store = useChannelsStore()
    store.configure(transport, picker)
    await store.connect()
    await store.selectChannel('product-collab')
    const originalSend = transport.sendMessage.bind(transport)
    vi.spyOn(transport, 'sendMessage')
      .mockRejectedValueOnce(new ChannelTransportError('transport', true))
      .mockImplementation(originalSend)
    const content = {
      kind: 'image' as const,
      media: { source: { kind: 'localFile' as const, token: 'file-token' }, name: 'design.png' },
    }

    await expect(store.sendContent(content)).rejects.toMatchObject({ code: 'transport' })
    expect(picker.release).not.toHaveBeenCalled()
    const failed = store.activeOutgoingAttempts[0]!

    await store.retryOutgoingMessage(failed.attemptId)
    await vi.waitFor(() => expect(picker.release).toHaveBeenCalledWith('file-token'))
    expect(store.activeOutgoingAttempts).toEqual([])
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
      release: vi.fn(async () => undefined),
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
    const messageRef = await addVoiceMessage(store, transport)
    await store.transcribeVoice(messageRef)
    expect(store.activeVoiceTranscripts).toHaveLength(1)
    transport.emitForTest({
      type: 'status.changed',
      status: { phase: 'kickedOffline', retryable: false },
    })
    expect(store.channels).toEqual([])
    expect(store.activeChannelRef).toBeNull()
    expect(store.activeVoiceTranscripts).toEqual([])
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
