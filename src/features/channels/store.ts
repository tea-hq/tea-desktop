import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type {
  ChannelEvent,
  ChannelRef,
  ChannelStatus,
  ChannelTransport,
  MessageRef,
  SendMessageResult,
} from './contracts'
import {
  createChannelProjection,
  mergeMessagePage,
  reduceChannelEvent,
  replaceChannels,
  type ChannelProjection,
} from './projection'

interface MessageCursor {
  hasMore: boolean
  anchor?: MessageRef
}

const INITIAL_MESSAGE_LIMIT = 50
const MAX_CHANNEL_PAGES = 5

export const useChannelsStore = defineStore('channels', () => {
  const transport = shallowRef<ChannelTransport | null>(null)
  const projection = reactive(createChannelProjection()) as unknown as ChannelProjection
  const status = ref<ChannelStatus>({ phase: 'disconnected', retryable: false })
  const activeChannelRef = ref<ChannelRef | null>(null)
  const messageCursors = reactive(new Map<ChannelRef, MessageCursor>())
  const loadingChannels = ref(false)
  const loadingMessages = ref(false)
  const sendingMessage = ref(false)
  const errorCode = ref<string | null>(null)
  let unsubscribe: (() => void) | null = null
  let refreshPromise: Promise<void> | null = null
  let lifecycleGeneration = 0

  const channels = computed(() => [...projection.channels.values()].sort((left, right) => right.updatedAt - left.updatedAt))
  const activeChannel = computed(() => activeChannelRef.value ? projection.channels.get(activeChannelRef.value) ?? null : null)
  const activeMessages = computed(() => activeChannelRef.value ? projection.messagesByChannel.get(activeChannelRef.value) ?? [] : [])
  const activeHasMoreMessages = computed(() => activeChannelRef.value ? messageCursors.get(activeChannelRef.value)?.hasMore ?? false : false)
  const capabilities = computed(() => transport.value?.capabilities() ?? [])

  function configure(value: ChannelTransport): void {
    if (transport.value === value) return
    lifecycleGeneration += 1
    const generation = lifecycleGeneration
    unsubscribe?.()
    if (transport.value) void transport.value.dispose()
    transport.value = value
    status.value = value.status()
    unsubscribe = value.subscribe(event => {
      if (generation === lifecycleGeneration && transport.value === value) handleEvent(event)
    })
    clearProjection()
  }

  async function connect(): Promise<void> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    errorCode.value = null
    try {
      await client.connect()
      if (generation !== lifecycleGeneration || transport.value !== client) return
      const nextStatus = client.status()
      if (status.value.accountRef && status.value.accountRef !== nextStatus.accountRef) clearProjection()
      status.value = nextStatus
      await refreshChannels()
    } catch (error) {
      status.value = client.status()
      errorCode.value = status.value.errorCode ?? transportErrorCode(error)
      throw error
    }
  }

  async function disconnect(): Promise<void> {
    const client = transport.value
    if (!client) return
    const generation = lifecycleGeneration
    await client.disconnect()
    if (generation !== lifecycleGeneration || transport.value !== client) return
    clearProjection()
    status.value = client.status()
  }

  async function refreshChannels(): Promise<void> {
    if (refreshPromise) return refreshPromise
    const client = requireTransport()
    const generation = lifecycleGeneration
    // The operation compares its own identity in finally to avoid clearing a newer refresh.
    let operation!: Promise<void>
    // eslint-disable-next-line prefer-const
    operation = (async () => {
      loadingChannels.value = true
      errorCode.value = null
      try {
        let offset = 0
        const values = []
        for (let pageIndex = 0; pageIndex < MAX_CHANNEL_PAGES; pageIndex += 1) {
          const page = await client.listChannels({ offset, limit: 100 })
          if (generation !== lifecycleGeneration || transport.value !== client) return
          values.push(...page.items)
          if (!page.hasMore) break
          offset = page.nextOffset
        }
        if (generation !== lifecycleGeneration || transport.value !== client) return
        replaceChannels(projection, values)
        if (activeChannelRef.value && !projection.channels.has(activeChannelRef.value)) activeChannelRef.value = null
        if (activeChannelRef.value && !projection.messagesByChannel.has(activeChannelRef.value)) {
          await loadMessages(activeChannelRef.value, false)
        }
      } catch (error) {
        if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
        throw error
      } finally {
        if (generation === lifecycleGeneration) loadingChannels.value = false
        if (refreshPromise === operation) refreshPromise = null
      }
    })()
    refreshPromise = operation
    return refreshPromise
  }

  async function selectChannel(channelRef: ChannelRef): Promise<void> {
    if (!projection.channels.has(channelRef)) return
    const client = requireTransport()
    const generation = lifecycleGeneration
    activeChannelRef.value = channelRef
    if (!projection.messagesByChannel.has(channelRef)) await loadMessages(channelRef, false)
    if (generation !== lifecycleGeneration
      || transport.value !== client
      || activeChannelRef.value !== channelRef) return
    try {
      await client.markRead(channelRef)
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!activeChannelRef.value || !activeHasMoreMessages.value) return
    await loadMessages(activeChannelRef.value, true)
  }

  async function sendText(text: string): Promise<SendMessageResult | null> {
    const channelRef = activeChannelRef.value
    const trimmed = text.trim()
    if (!channelRef || !trimmed || sendingMessage.value) return null
    const client = requireTransport()
    const generation = lifecycleGeneration
    sendingMessage.value = true
    errorCode.value = null
    try {
      const result = await client.sendMessage({ channelRef, text: trimmed })
      return generation === lifecycleGeneration && transport.value === client ? result : null
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) sendingMessage.value = false
    }
  }

  async function openDirectConversation(accountId: string): Promise<ChannelRef> {
    const client = requireTransport()
    const channelRef = await client.openDirectConversation(accountId)
    activeChannelRef.value = channelRef
    await refreshChannels()
    return channelRef
  }

  async function dispose(): Promise<void> {
    lifecycleGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    const client = transport.value
    transport.value = null
    clearProjection()
    refreshPromise = null
    loadingChannels.value = false
    loadingMessages.value = false
    sendingMessage.value = false
    errorCode.value = null
    status.value = { phase: 'disconnected', retryable: false }
    if (client) await client.dispose()
  }

  async function loadMessages(channelRef: ChannelRef, older: boolean): Promise<void> {
    if (loadingMessages.value) return
    const cursor = messageCursors.get(channelRef)
    const client = requireTransport()
    const generation = lifecycleGeneration
    loadingMessages.value = true
    try {
      const page = await client.loadMessages({
        channelRef,
        direction: 'before',
        limit: INITIAL_MESSAGE_LIMIT,
        anchorMessage: older ? cursor?.anchor : undefined,
      })
      if (generation !== lifecycleGeneration || transport.value !== client) return
      mergeMessagePage(projection, page)
      messageCursors.set(channelRef, { hasMore: page.hasMore, anchor: page.nextAnchor })
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) loadingMessages.value = false
    }
  }

  function handleEvent(event: ChannelEvent): void {
    if (event.type === 'status.changed'
      && status.value.accountRef
      && event.status.accountRef
      && status.value.accountRef !== event.status.accountRef) {
      clearProjection()
    }
    status.value = event.type === 'status.changed' ? event.status : status.value
    reduceChannelEvent(projection, event)
    if (event.type === 'status.changed') {
      if (event.status.phase === 'kickedOffline' || (event.status.phase === 'disconnected' && !event.status.retryable)) {
        clearProjection()
      }
      if (event.status.phase === 'connected') void refreshChannels().catch(() => undefined)
    } else if (event.type === 'sync.finished') {
      void refreshChannels().catch(() => undefined)
    } else if (event.type === 'sync.failed') {
      errorCode.value = event.errorCode
    }
  }

  function clearProjection(): void {
    projection.channels.clear()
    projection.messagesByChannel.clear()
    projection.totalUnreadCount = 0
    activeChannelRef.value = null
    messageCursors.clear()
  }

  function requireTransport(): ChannelTransport {
    if (!transport.value) throw new Error('channelTransportNotConfigured')
    return transport.value
  }

  return {
    channels,
    activeChannelRef,
    activeChannel,
    activeMessages,
    activeHasMoreMessages,
    status,
    capabilities,
    loadingChannels,
    loadingMessages,
    sendingMessage,
    errorCode,
    configure,
    connect,
    disconnect,
    refreshChannels,
    selectChannel,
    loadOlderMessages,
    sendText,
    openDirectConversation,
    dispose,
  }
})

function transportErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'transport'
}
