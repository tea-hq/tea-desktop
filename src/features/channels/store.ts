import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type {
  ChannelAttachment,
  ChannelAttachmentPicker,
  ChannelEvent,
  ChannelDetails,
  ChannelMemberPage,
  ChannelRef,
  ChannelStatus,
  ChannelTransport,
  DeleteMessagesRequest,
  CreateGroupRequest,
  UpdateGroupRequest,
  GroupMembersRequest,
  GroupMemberRoleRequest,
  GroupMemberMuteRequest,
  ModifyMessageRequest,
  PinMessageRequest,
  PinnedMessage,
  SavedMessage,
  QuickCommentRequest,
  ReplyMessageRequest,
  ForwardMessageRequest,
  ForwardMessageResult,
  RevokeMessageRequest,
  ListChannelMembersRequest,
  MessageRef,
  Message,
  MessageSearchPage,
  MessageSearchState,
  OutgoingMessageContent,
  SearchMessagesRequest,
  SendMessageResult,
} from './contracts'
import { createTextMessageContent } from './messageContent'
import {
  createChannelProjection,
  mergeMessagePage,
  reduceChannelEvent,
  replaceChannels,
  sameMessage,
  type ChannelProjection,
} from './projection'

interface MessageCursorBoundary {
  hasMore: boolean
  anchor?: MessageRef
}

interface MessageCursor {
  before: MessageCursorBoundary
  after: MessageCursorBoundary
  loadedLatest: boolean
}

type MessageLoadDirection = 'before' | 'after'

const INITIAL_MESSAGE_LIMIT = 50
const SAVED_MESSAGE_LIMIT = 50
const MAX_CHANNEL_PAGES = 5

export const useChannelsStore = defineStore('channels', () => {
  const transport = shallowRef<ChannelTransport | null>(null)
  const attachmentPicker = shallowRef<ChannelAttachmentPicker | null>(null)
  const projection = reactive(createChannelProjection()) as unknown as ChannelProjection
  const status = ref<ChannelStatus>({ phase: 'disconnected', retryable: false })
  const activeChannelRef = ref<ChannelRef | null>(null)
  const highlightedMessageKey = ref<string | null>(null)
  const messageCursors = reactive(new Map<ChannelRef, MessageCursor>())
  const messageSearch = reactive<MessageSearchState>(createMessageSearchState())
  const pinnedMessages = shallowRef<PinnedMessage[]>([])
  const pinnedMessagesChannelRef = ref<ChannelRef | null>(null)
  const loadingPinnedMessages = ref(false)
  const pinnedMessagesErrorCode = ref<string | null>(null)
  const savedMessages = shallowRef<SavedMessage[]>([])
  const savedMessagesTotalCount = ref(0)
  const savedMessagesCursor = ref<string | undefined>()
  const savedMessagesHasMore = ref(false)
  const loadingSavedMessages = ref(false)
  const loadingMoreSavedMessages = ref(false)
  const savingMessage = ref(false)
  const removingSavedMessageId = ref<string | null>(null)
  const savedMessagesErrorCode = ref<string | null>(null)
  const refreshingChannels = ref(false)
  const synchronizingChannels = ref(false)
  const channelCatalogReady = ref(true)
  const initialConversationSyncFinished = ref(false)
  const loadingMessageRequests = reactive(new Map<string, number>())
  const sendingMessage = ref(false)
  const sendingProgress = ref(0)
  const activeSendOperationId = ref<string | null>(null)
  const mutatingMessage = ref(false)
  const loadingMergedMessages = ref(false)
  const mergedMessagesErrorCode = ref<string | null>(null)
  const errorCode = ref<string | null>(null)
  let unsubscribe: (() => void) | null = null
  let refreshPromise: Promise<void> | null = null
  let lifecycleGeneration = 0
  let loadingMessageOperationId = 0
  let messageSearchOperationId = 0
  let pinnedMessagesOperationId = 0
  let savedMessagesOperationId = 0
  let mergedMessagesOperationId = 0

  const channels = computed(() =>
    [...projection.channels.values()].sort((left, right) => right.updatedAt - left.updatedAt),
  )
  const activeChannel = computed(() =>
    activeChannelRef.value ? (projection.channels.get(activeChannelRef.value) ?? null) : null,
  )
  const activeMessages = computed(() =>
    activeChannelRef.value ? (projection.messagesByChannel.get(activeChannelRef.value) ?? []) : [],
  )
  const activeHasMoreMessages = computed(() =>
    activeChannelRef.value
      ? (messageCursors.get(activeChannelRef.value)?.before.hasMore ?? false)
      : false,
  )
  const activeHasMoreNewerMessages = computed(() =>
    activeChannelRef.value
      ? (messageCursors.get(activeChannelRef.value)?.after.hasMore ?? false)
      : false,
  )
  const capabilities = computed(() => transport.value?.capabilities() ?? [])
  const loadingChannels = computed(
    () => refreshingChannels.value || synchronizingChannels.value || !channelCatalogReady.value,
  )
  const loadingMessages = computed(() => loadingMessageRequests.size > 0)

  function configure(value: ChannelTransport, picker?: ChannelAttachmentPicker): void {
    if (transport.value === value) return
    lifecycleGeneration += 1
    const generation = lifecycleGeneration
    unsubscribe?.()
    if (transport.value) void transport.value.dispose()
    transport.value = value
    attachmentPicker.value = picker ?? null
    status.value = value.status()
    refreshPromise = null
    refreshingChannels.value = false
    synchronizingChannels.value = false
    loadingMessageRequests.clear()
    channelCatalogReady.value = false
    initialConversationSyncFinished.value = false
    unsubscribe = value.subscribe((event) => {
      if (generation === lifecycleGeneration && transport.value === value) handleEvent(event)
    })
    clearProjection()
  }

  async function connect(): Promise<void> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    if (projection.channels.size === 0 && status.value.phase !== 'connected') {
      channelCatalogReady.value = false
      initialConversationSyncFinished.value = false
    }
    errorCode.value = null
    try {
      await client.connect()
      if (generation !== lifecycleGeneration || transport.value !== client) return
      const nextStatus = client.status()
      if (status.value.accountRef && status.value.accountRef !== nextStatus.accountRef)
        clearProjection()
      status.value = nextStatus
      await refreshChannels()
    } catch (error) {
      status.value = client.status()
      errorCode.value = status.value.errorCode ?? transportErrorCode(error)
      if (generation === lifecycleGeneration) {
        synchronizingChannels.value = false
        channelCatalogReady.value = true
      }
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
      refreshingChannels.value = true
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
        // An empty provider page is not authoritative until conversation sync has completed.
        if (values.length > 0 || initialConversationSyncFinished.value)
          channelCatalogReady.value = true
        if (activeChannelRef.value && !projection.channels.has(activeChannelRef.value))
          activeChannelRef.value = null
        if (activeChannelRef.value && !projection.messagesByChannel.has(activeChannelRef.value)) {
          await loadMessages(activeChannelRef.value, 'before')
        }
      } catch (error) {
        if (generation === lifecycleGeneration) {
          errorCode.value = transportErrorCode(error)
          channelCatalogReady.value = true
        }
        throw error
      } finally {
        if (generation === lifecycleGeneration) refreshingChannels.value = false
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
    errorCode.value = null
    highlightedMessageKey.value = null
    if (pinnedMessagesChannelRef.value !== channelRef) clearPinnedMessages()
    activeChannelRef.value = channelRef
    if (!projection.messagesByChannel.has(channelRef)) await loadMessages(channelRef, 'before')
    else ensureMessageCursor(channelRef)
    if (
      generation !== lifecycleGeneration ||
      transport.value !== client ||
      activeChannelRef.value !== channelRef
    )
      return
    try {
      await client.markRead(channelRef)
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
    }
  }

  async function getChannelDetails(channelRef: ChannelRef): Promise<ChannelDetails> {
    const client = requireTransport()
    try {
      const result = await client.getChannelDetails(channelRef)
      return structuredClone(result)
    } catch (error) {
      errorCode.value = transportErrorCode(error)
      throw error
    }
  }

  async function listChannelMembers(
    request: ListChannelMembersRequest,
  ): Promise<ChannelMemberPage> {
    const client = requireTransport()
    try {
      const result = await client.listChannelMembers(request)
      return structuredClone(result)
    } catch (error) {
      errorCode.value = transportErrorCode(error)
      throw error
    }
  }

  async function createGroup(request: CreateGroupRequest): Promise<ChannelRef | null> {
    const client = requireTransport()
    try {
      const channel = await client.createGroup(request)
      await refreshChannels()
      activeChannelRef.value = channel.ref
      return channel.ref
    } catch (error) {
      errorCode.value = transportErrorCode(error)
      throw error
    }
  }

  async function updateGroup(request: UpdateGroupRequest): Promise<void> {
    await mutateMessage((client) => client.updateGroup(request))
  }

  async function inviteGroupMembers(
    request: GroupMembersRequest,
  ): Promise<{ failedAccountIds: string[] }> {
    const client = requireTransport()
    try {
      return await client.inviteGroupMembers(request)
    } catch (error) {
      errorCode.value = transportErrorCode(error)
      throw error
    }
  }

  async function removeGroupMembers(request: GroupMembersRequest): Promise<void> {
    await mutateMessage((client) => client.removeGroupMembers(request))
  }

  async function leaveGroup(channelRef: ChannelRef): Promise<void> {
    await mutateMessage((client) => client.leaveGroup(channelRef))
  }

  async function dismissGroup(channelRef: ChannelRef): Promise<void> {
    await mutateMessage((client) => client.dismissGroup(channelRef))
  }

  async function setGroupMemberRole(request: GroupMemberRoleRequest): Promise<void> {
    await mutateMessage((client) => client.setGroupMemberRole(request))
  }

  async function setGroupMemberMute(request: GroupMemberMuteRequest): Promise<void> {
    await mutateMessage((client) => client.setGroupMemberMute(request))
  }

  async function loadOlderMessages(): Promise<void> {
    const channelRef = activeChannelRef.value
    if (!channelRef || !activeHasMoreMessages.value) return
    await loadMessages(channelRef, 'before')
  }

  async function loadNewerMessages(force = false): Promise<void> {
    const channelRef = activeChannelRef.value
    const cursor = channelRef ? messageCursors.get(channelRef) : undefined
    if (!channelRef || !cursor) return
    if (!force && (cursor.loadedLatest || !cursor.after.hasMore)) return
    await loadMessages(channelRef, 'after')
  }

  async function searchMessages(
    keyword: string,
    channelRef = activeChannelRef.value,
  ): Promise<void> {
    const value = keyword.trim()
    if (!value) {
      clearMessageSearch()
      return
    }
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = ++messageSearchOperationId
    resetMessageSearch({ query: value, channelRef })
    messageSearch.loading = true
    errorCode.value = null
    try {
      const page = await client.searchMessages({
        keyword: value,
        ...(channelRef ? { channelRef } : {}),
        limit: INITIAL_MESSAGE_LIMIT,
        direction: 'newest',
      })
      if (
        generation !== lifecycleGeneration ||
        transport.value !== client ||
        operationId !== messageSearchOperationId
      )
        return
      applyMessageSearchPage(page, false)
    } catch (error) {
      if (generation === lifecycleGeneration && operationId === messageSearchOperationId) {
        messageSearch.errorCode = transportErrorCode(error)
        errorCode.value = messageSearch.errorCode
      }
      throw error
    } finally {
      if (generation === lifecycleGeneration && operationId === messageSearchOperationId)
        messageSearch.loading = false
    }
  }

  async function loadMoreSearchMessages(): Promise<void> {
    if (!messageSearch.query || !messageSearch.hasMore || messageSearch.loading) return
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = ++messageSearchOperationId
    messageSearch.loading = true
    messageSearch.errorCode = null
    try {
      const request: SearchMessagesRequest = {
        keyword: messageSearch.query,
        ...(messageSearch.channelRef ? { channelRef: messageSearch.channelRef } : {}),
        limit: INITIAL_MESSAGE_LIMIT,
        ...(messageSearch.nextCursor ? { cursor: messageSearch.nextCursor } : {}),
        direction: 'newest',
      }
      const page = await client.searchMessages(request)
      if (
        generation !== lifecycleGeneration ||
        transport.value !== client ||
        operationId !== messageSearchOperationId
      )
        return
      applyMessageSearchPage(page, true)
    } catch (error) {
      if (generation === lifecycleGeneration && operationId === messageSearchOperationId) {
        messageSearch.errorCode = transportErrorCode(error)
        errorCode.value = messageSearch.errorCode
      }
      throw error
    } finally {
      if (generation === lifecycleGeneration && operationId === messageSearchOperationId)
        messageSearch.loading = false
    }
  }

  function clearMessageSearch(): void {
    messageSearchOperationId += 1
    resetMessageSearch()
  }

  function resetMessageSearch(next: { query?: string; channelRef?: ChannelRef | null } = {}): void {
    messageSearch.query = next.query ?? ''
    messageSearch.channelRef = next.channelRef ?? null
    messageSearch.items = []
    messageSearch.totalCount = 0
    messageSearch.hasMore = false
    delete messageSearch.nextCursor
    messageSearch.loading = false
    messageSearch.errorCode = null
  }

  function applyMessageSearchPage(page: MessageSearchPage, append: boolean): void {
    const existing = append ? (messageSearch.items as unknown as Message[]) : []
    const items: Message[] = [...existing]
    for (const message of page.items) {
      const index = items.findIndex((candidate) => sameMessage(candidate.ref, message.ref))
      const value = structuredClone(message) as Message
      if (index >= 0) items[index] = value
      else items.push(value)
      mergeMessagePage(projection, {
        channelRef: message.ref.channelRef,
        items: [message],
        hasMore: false,
      })
    }
    ;(messageSearch as unknown as MessageSearchState).items = items
    messageSearch.totalCount = page.totalCount
    messageSearch.hasMore = page.hasMore && Boolean(page.nextCursor)
    if (page.nextCursor) messageSearch.nextCursor = page.nextCursor
    else delete messageSearch.nextCursor
  }

  async function jumpToMessage(ref: MessageRef): Promise<void> {
    const client = requireTransport()
    if (!projection.channels.has(ref.channelRef)) {
      await refreshChannels()
    }
    if (!projection.channels.has(ref.channelRef)) {
      throw new Error('channelNotFound')
    }
    if (activeChannelRef.value !== ref.channelRef) await selectChannel(ref.channelRef)
    else ensureMessageCursor(ref.channelRef)
    highlightedMessageKey.value = messageKey(ref)
    if (
      !(projection.messagesByChannel.get(ref.channelRef) ?? []).some((item) =>
        sameMessage(item.ref, ref),
      )
    ) {
      await loadMessages(ref.channelRef, 'before')
    }
    if (transport.value !== client) return
  }

  async function loadPinnedMessages(channelRef = activeChannelRef.value): Promise<void> {
    if (!channelRef) {
      clearPinnedMessages()
      return
    }
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = ++pinnedMessagesOperationId
    pinnedMessagesChannelRef.value = channelRef
    loadingPinnedMessages.value = true
    pinnedMessagesErrorCode.value = null
    try {
      const values = await client.listPinnedMessages(channelRef)
      if (
        generation !== lifecycleGeneration ||
        transport.value !== client ||
        operationId !== pinnedMessagesOperationId ||
        pinnedMessagesChannelRef.value !== channelRef
      )
        return
      pinnedMessages.value = values.map((value) => structuredClone(value))
      for (const value of values) {
        mergeMessagePage(projection, {
          channelRef: value.message.ref.channelRef,
          items: [value.message],
          hasMore: false,
        })
      }
    } catch (error) {
      if (generation === lifecycleGeneration && operationId === pinnedMessagesOperationId) {
        pinnedMessagesErrorCode.value = transportErrorCode(error)
        errorCode.value = pinnedMessagesErrorCode.value
      }
      throw error
    } finally {
      if (generation === lifecycleGeneration && operationId === pinnedMessagesOperationId)
        loadingPinnedMessages.value = false
    }
  }

  function clearPinnedMessages(): void {
    pinnedMessagesOperationId += 1
    pinnedMessages.value = []
    pinnedMessagesChannelRef.value = null
    loadingPinnedMessages.value = false
    pinnedMessagesErrorCode.value = null
  }

  async function loadSavedMessages(): Promise<void> {
    clearSavedMessages()
    await loadSavedMessagePage(false)
  }

  async function loadMoreSavedMessages(): Promise<void> {
    if (!savedMessagesHasMore.value || loadingMoreSavedMessages.value) return
    await loadSavedMessagePage(true)
  }

  async function loadSavedMessagePage(append: boolean): Promise<void> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = ++savedMessagesOperationId
    if (append) loadingMoreSavedMessages.value = true
    else loadingSavedMessages.value = true
    savedMessagesErrorCode.value = null
    try {
      const page = await client.listSavedMessages({
        limit: SAVED_MESSAGE_LIMIT,
        ...(append && savedMessagesCursor.value ? { cursor: savedMessagesCursor.value } : {}),
      })
      if (
        generation !== lifecycleGeneration ||
        transport.value !== client ||
        operationId !== savedMessagesOperationId
      )
        return
      const byId = new Map<string, SavedMessage>()
      for (const value of append ? [...savedMessages.value, ...page.items] : page.items)
        byId.set(value.id, structuredClone(value))
      savedMessages.value = [...byId.values()]
      savedMessagesTotalCount.value = Math.max(page.totalCount, savedMessages.value.length)
      savedMessagesHasMore.value = page.hasMore && Boolean(page.nextCursor)
      savedMessagesCursor.value = page.nextCursor
      mergeSavedMessageProjection(page.items)
    } catch (error) {
      if (generation === lifecycleGeneration && operationId === savedMessagesOperationId) {
        savedMessagesErrorCode.value = transportErrorCode(error)
        errorCode.value = savedMessagesErrorCode.value
      }
      throw error
    } finally {
      if (generation === lifecycleGeneration && operationId === savedMessagesOperationId) {
        loadingSavedMessages.value = false
        loadingMoreSavedMessages.value = false
      }
    }
  }

  async function saveMessage(messageRef: MessageRef, sourceChannelName?: string): Promise<void> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    savingMessage.value = true
    savedMessagesErrorCode.value = null
    try {
      const value = await client.saveMessage({ messageRef, sourceChannelName })
      if (generation !== lifecycleGeneration || transport.value !== client) return
      const existing = savedMessages.value.some((candidate) => candidate.id === value.id)
      savedMessages.value = [
        structuredClone(value),
        ...savedMessages.value.filter((candidate) => candidate.id !== value.id),
      ]
      if (!existing) savedMessagesTotalCount.value += 1
      mergeSavedMessageProjection([value])
    } catch (error) {
      if (generation === lifecycleGeneration) {
        savedMessagesErrorCode.value = transportErrorCode(error)
        errorCode.value = savedMessagesErrorCode.value
      }
      throw error
    } finally {
      if (generation === lifecycleGeneration) savingMessage.value = false
    }
  }

  async function removeSavedMessage(savedMessageId: string): Promise<void> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    removingSavedMessageId.value = savedMessageId
    savedMessagesErrorCode.value = null
    try {
      await client.removeSavedMessage(savedMessageId)
      if (generation !== lifecycleGeneration || transport.value !== client) return
      const hadValue = savedMessages.value.some((value) => value.id === savedMessageId)
      savedMessages.value = savedMessages.value.filter((value) => value.id !== savedMessageId)
      if (hadValue) savedMessagesTotalCount.value = Math.max(0, savedMessagesTotalCount.value - 1)
    } catch (error) {
      if (generation === lifecycleGeneration) {
        savedMessagesErrorCode.value = transportErrorCode(error)
        errorCode.value = savedMessagesErrorCode.value
      }
      throw error
    } finally {
      if (generation === lifecycleGeneration && removingSavedMessageId.value === savedMessageId)
        removingSavedMessageId.value = null
    }
  }

  function clearSavedMessages(): void {
    savedMessagesOperationId += 1
    savedMessages.value = []
    savedMessagesTotalCount.value = 0
    savedMessagesCursor.value = undefined
    savedMessagesHasMore.value = false
    loadingSavedMessages.value = false
    loadingMoreSavedMessages.value = false
    savingMessage.value = false
    removingSavedMessageId.value = null
    savedMessagesErrorCode.value = null
  }

  function mergeSavedMessageProjection(items: SavedMessage[]): void {
    for (const value of items) {
      mergeMessagePage(projection, {
        channelRef: value.message.ref.channelRef,
        items: [value.message],
        hasMore: false,
      })
    }
  }

  async function pickAttachments(): Promise<ChannelAttachment[]> {
    const picker = attachmentPicker.value
    if (!picker) return []
    try {
      const attachments = await picker.pick()
      return attachments.map((attachment) => structuredClone(attachment))
    } catch (error) {
      errorCode.value = transportErrorCode(error)
      throw error
    }
  }

  async function sendText(text: string, replyTo?: MessageRef): Promise<SendMessageResult | null> {
    const trimmed = text.trim()
    if (!trimmed) return null
    return sendContent(createTextMessageContent(trimmed), replyTo)
  }

  async function sendContent(
    content: OutgoingMessageContent,
    replyTo?: MessageRef,
  ): Promise<SendMessageResult | null> {
    const channelRef = activeChannelRef.value
    if (!channelRef || sendingMessage.value) return null
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = randomOperationId()
    sendingMessage.value = true
    sendingProgress.value = 0
    activeSendOperationId.value = operationId
    errorCode.value = null
    try {
      const result = replyTo
        ? await client.replyMessage({
            channelRef,
            replyTo,
            content,
            operationId,
          } satisfies ReplyMessageRequest)
        : await client.sendMessage({ channelRef, content, operationId })
      return generation === lifecycleGeneration && transport.value === client ? result : null
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) {
        sendingMessage.value = false
        sendingProgress.value = 0
        activeSendOperationId.value = null
      }
    }
  }

  async function cancelSend(operationId = activeSendOperationId.value): Promise<void> {
    if (!operationId) return
    await requireTransport().cancelMessageSend(operationId)
  }

  async function forwardMessage(request: ForwardMessageRequest): Promise<ForwardMessageResult> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    mutatingMessage.value = true
    errorCode.value = null
    try {
      const result = await client.forwardMessage(request)
      return generation === lifecycleGeneration && transport.value === client
        ? result
        : { messages: [] }
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) mutatingMessage.value = false
    }
  }

  async function loadMergedMessages(messageRef: MessageRef): Promise<Message[]> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = ++mergedMessagesOperationId
    loadingMergedMessages.value = true
    mergedMessagesErrorCode.value = null
    try {
      const messages = await client.loadMergedMessages(messageRef)
      return generation === lifecycleGeneration &&
        transport.value === client &&
        operationId === mergedMessagesOperationId
        ? structuredClone(messages)
        : []
    } catch (error) {
      if (generation !== lifecycleGeneration || operationId !== mergedMessagesOperationId) return []
      mergedMessagesErrorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration && operationId === mergedMessagesOperationId)
        loadingMergedMessages.value = false
    }
  }

  async function modifyMessage(messageRef: MessageRef, text: string): Promise<void> {
    await mutateMessage((client) =>
      client.modifyMessage({ messageRef, text } satisfies ModifyMessageRequest),
    )
  }

  async function deleteMessages(messageRefs: MessageRef[]): Promise<void> {
    await mutateMessage((client) =>
      client.deleteMessages({ messageRefs } satisfies DeleteMessagesRequest),
    )
  }

  async function revokeMessage(messageRef: MessageRef, postscript?: string): Promise<void> {
    await mutateMessage((client) =>
      client.revokeMessage({ messageRef, postscript } satisfies RevokeMessageRequest),
    )
  }

  async function pinMessage(messageRef: MessageRef, pinned: boolean): Promise<void> {
    await mutateMessage((client) =>
      client.pinMessage({ messageRef, pinned } satisfies PinMessageRequest),
    )
  }

  async function quickComment(request: QuickCommentRequest): Promise<void> {
    await mutateMessage((client) => client.quickComment(request))
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
    attachmentPicker.value = null
    clearProjection()
    refreshPromise = null
    refreshingChannels.value = false
    synchronizingChannels.value = false
    channelCatalogReady.value = true
    initialConversationSyncFinished.value = false
    loadingMessageRequests.clear()
    sendingMessage.value = false
    sendingProgress.value = 0
    activeSendOperationId.value = null
    mutatingMessage.value = false
    errorCode.value = null
    status.value = { phase: 'disconnected', retryable: false }
    if (client) await client.dispose()
  }

  async function loadMessages(
    channelRef: ChannelRef,
    direction: MessageLoadDirection,
  ): Promise<void> {
    const requestKey = `${channelRef}:${direction}`
    if (loadingMessageRequests.has(requestKey)) return
    const cursor = messageCursors.get(channelRef) ?? createMessageCursor()
    messageCursors.set(channelRef, cursor)
    const client = requireTransport()
    const generation = lifecycleGeneration
    const operationId = loadingMessageOperationId++
    loadingMessageRequests.set(requestKey, operationId)
    try {
      const boundary = direction === 'before' ? cursor.before : cursor.after
      const page = await client.loadMessages({
        channelRef,
        direction,
        limit: INITIAL_MESSAGE_LIMIT,
        anchorMessage: boundary.anchor,
      })
      if (
        generation !== lifecycleGeneration ||
        transport.value !== client ||
        !projection.channels.has(channelRef)
      )
        return
      mergeMessagePage(projection, page)
      const messages = projection.messagesByChannel.get(channelRef) ?? []
      const pageAnchor =
        page.nextAnchor ?? (direction === 'before' ? page.items[0]?.ref : page.items.at(-1)?.ref)
      const pageHasMore = page.hasMore && Boolean(pageAnchor)
      if (direction === 'before') {
        cursor.before = {
          hasMore: pageHasMore,
          ...(pageAnchor ? { anchor: pageAnchor } : {}),
        }
        if (!cursor.after.anchor && messages.length > 0) {
          cursor.after.anchor = messages.at(-1)!.ref
        }
        if (!boundary.anchor) cursor.loadedLatest = true
      } else {
        cursor.after = {
          hasMore: pageHasMore,
          ...(pageAnchor
            ? { anchor: pageAnchor }
            : boundary.anchor
              ? { anchor: boundary.anchor }
              : {}),
        }
        cursor.loadedLatest = !pageHasMore
      }
      messageCursors.set(channelRef, cursor)
    } catch (error) {
      if (generation === lifecycleGeneration && activeChannelRef.value === channelRef)
        errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (loadingMessageRequests.get(requestKey) === operationId)
        loadingMessageRequests.delete(requestKey)
    }
  }

  function handleEvent(event: ChannelEvent): void {
    const previousStatusPhase = status.value.phase
    if (
      event.type === 'status.changed' &&
      status.value.accountRef &&
      event.status.accountRef &&
      status.value.accountRef !== event.status.accountRef
    ) {
      clearProjection()
      channelCatalogReady.value = false
      initialConversationSyncFinished.value = false
    }
    status.value = event.type === 'status.changed' ? event.status : status.value
    reduceChannelEvent(projection, event)
    reconcileMessageCursors(event)
    reconcilePinnedMessages(event)
    if (event.type === 'status.changed') {
      if (
        event.status.phase === 'kickedOffline' ||
        (event.status.phase === 'disconnected' && !event.status.retryable)
      ) {
        clearProjection()
        synchronizingChannels.value = false
        channelCatalogReady.value = true
        initialConversationSyncFinished.value = false
      }
      if (event.status.phase === 'failed') {
        synchronizingChannels.value = false
        channelCatalogReady.value = true
      }
      if (
        event.status.phase === 'connecting' &&
        previousStatusPhase !== 'connected' &&
        projection.channels.size === 0
      ) {
        channelCatalogReady.value = false
        initialConversationSyncFinished.value = false
      }
      if (event.status.phase === 'connected') void refreshChannels().catch(() => undefined)
    } else if (event.type === 'sync.started') {
      synchronizingChannels.value = true
      if (projection.channels.size === 0) channelCatalogReady.value = false
    } else if (event.type === 'sync.finished') {
      synchronizingChannels.value = false
      initialConversationSyncFinished.value = true
      void refreshChannels().catch(() => undefined)
    } else if (event.type === 'sync.failed') {
      synchronizingChannels.value = false
      initialConversationSyncFinished.value = true
      channelCatalogReady.value = true
      errorCode.value = event.errorCode
    } else if (event.type === 'message.sendProgress') {
      if (event.operationId === activeSendOperationId.value)
        sendingProgress.value = Math.max(0, Math.min(100, event.progress))
    }
  }

  function clearProjection(): void {
    messageSearchOperationId += 1
    mergedMessagesOperationId += 1
    projection.channels.clear()
    projection.messagesByChannel.clear()
    projection.totalUnreadCount = 0
    activeChannelRef.value = null
    highlightedMessageKey.value = null
    messageCursors.clear()
    resetMessageSearch()
    clearPinnedMessages()
    clearSavedMessages()
    loadingMergedMessages.value = false
    mergedMessagesErrorCode.value = null
  }

  function ensureMessageCursor(channelRef: ChannelRef): MessageCursor {
    const existing = messageCursors.get(channelRef)
    if (existing) return existing
    const cursor = createMessageCursor()
    const latest = projection.messagesByChannel.get(channelRef)?.at(-1)?.ref
    if (latest) {
      cursor.after.anchor = latest
      cursor.loadedLatest = true
    }
    messageCursors.set(channelRef, cursor)
    return cursor
  }

  function reconcileMessageCursors(event: ChannelEvent): void {
    if (event.type === 'channel.deleted') {
      for (const channelRef of event.channelRefs) messageCursors.delete(channelRef)
      return
    }
    if (event.type === 'message.historyCleared') {
      messageCursors.delete(event.channelRef)
      return
    }
    if (event.type !== 'message.deleted') return
    const affectedChannels = new Set(event.refs.map((ref) => ref.channelRef))
    for (const channelRef of affectedChannels) {
      const cursor = messageCursors.get(channelRef)
      if (!cursor) continue
      const messages = projection.messagesByChannel.get(channelRef) ?? []
      const first = messages[0]?.ref
      const last = messages.at(-1)?.ref
      if (
        cursor.before.anchor &&
        event.refs.some((ref) => sameMessage(ref, cursor.before.anchor!))
      ) {
        cursor.before.anchor = first
        if (!first) cursor.before.hasMore = false
      }
      if (cursor.after.anchor && event.refs.some((ref) => sameMessage(ref, cursor.after.anchor!))) {
        cursor.after.anchor = last
        if (!last) cursor.after.hasMore = false
      }
    }
  }

  function reconcilePinnedMessages(event: ChannelEvent): void {
    const channelRef = pinnedMessagesChannelRef.value
    if (!channelRef) return
    if (event.type === 'channel.deleted' && event.channelRefs.includes(channelRef)) {
      clearPinnedMessages()
      return
    }
    if (event.type === 'message.historyCleared' && event.channelRef === channelRef) {
      clearPinnedMessages()
      return
    }
    if (event.type === 'message.deleted') {
      pinnedMessages.value = pinnedMessages.value.filter(
        (value) => !event.refs.some((ref) => sameMessage(value.message.ref, ref)),
      )
      return
    }
    if (event.type === 'message.upserted') {
      pinnedMessages.value = pinnedMessages.value.map((value) => {
        const message = event.messages.find((candidate) =>
          sameMessage(candidate.ref, value.message.ref),
        )
        return message
          ? { ...value, message: { ...structuredClone(message), pinned: true } }
          : value
      })
      return
    }
    if (event.type !== 'message.pinChanged' || event.ref.channelRef !== channelRef) return
    if (!event.pinned) {
      pinnedMessages.value = pinnedMessages.value.filter(
        (value) => !sameMessage(value.message.ref, event.ref),
      )
      return
    }
    const message = (projection.messagesByChannel.get(channelRef) ?? []).find((candidate) =>
      sameMessage(candidate.ref, event.ref),
    )
    if (!message) return
    const existing = pinnedMessages.value.find((value) => sameMessage(value.message.ref, event.ref))
    pinnedMessages.value = [
      {
        ...existing,
        message: { ...structuredClone(message), pinned: true },
        pinnedAt: existing?.pinnedAt ?? event.occurredAt,
      },
      ...pinnedMessages.value.filter((value) => !sameMessage(value.message.ref, event.ref)),
    ]
  }

  function requireTransport(): ChannelTransport {
    if (!transport.value) throw new Error('channelTransportNotConfigured')
    return transport.value
  }

  async function mutateMessage(
    operation: (client: ChannelTransport) => Promise<void>,
  ): Promise<void> {
    const client = requireTransport()
    const generation = lifecycleGeneration
    mutatingMessage.value = true
    errorCode.value = null
    try {
      await operation(client)
      if (generation !== lifecycleGeneration || transport.value !== client) return
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) mutatingMessage.value = false
    }
  }

  return {
    channels,
    activeChannelRef,
    highlightedMessageKey,
    activeChannel,
    activeMessages,
    activeHasMoreMessages,
    activeHasMoreNewerMessages,
    status,
    capabilities,
    loadingChannels,
    loadingMessages,
    messageSearch,
    pinnedMessages,
    pinnedMessagesChannelRef,
    loadingPinnedMessages,
    pinnedMessagesErrorCode,
    savedMessages,
    savedMessagesTotalCount,
    savedMessagesHasMore,
    loadingSavedMessages,
    loadingMoreSavedMessages,
    savingMessage,
    removingSavedMessageId,
    savedMessagesErrorCode,
    sendingMessage,
    mutatingMessage,
    loadingMergedMessages,
    mergedMessagesErrorCode,
    errorCode,
    configure,
    connect,
    disconnect,
    refreshChannels,
    selectChannel,
    getChannelDetails,
    listChannelMembers,
    createGroup,
    updateGroup,
    inviteGroupMembers,
    removeGroupMembers,
    leaveGroup,
    dismissGroup,
    setGroupMemberRole,
    setGroupMemberMute,
    loadOlderMessages,
    loadNewerMessages,
    searchMessages,
    loadMoreSearchMessages,
    clearMessageSearch,
    jumpToMessage,
    loadPinnedMessages,
    clearPinnedMessages,
    loadSavedMessages,
    loadMoreSavedMessages,
    saveMessage,
    removeSavedMessage,
    clearSavedMessages,
    sendText,
    sendContent,
    pickAttachments,
    cancelSend,
    sendingProgress,
    forwardMessage,
    loadMergedMessages,
    modifyMessage,
    deleteMessages,
    revokeMessage,
    pinMessage,
    quickComment,
    openDirectConversation,
    dispose,
  }
})

function createMessageCursor(): MessageCursor {
  return {
    before: { hasMore: true },
    after: { hasMore: false },
    loadedLatest: false,
  }
}

function transportErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'transport'
}

function randomOperationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `send-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

function createMessageSearchState(): MessageSearchState {
  return {
    query: '',
    channelRef: null,
    items: [],
    totalCount: 0,
    hasMore: false,
    loading: false,
    errorCode: null,
  }
}

function messageKey(ref: MessageRef): string {
  return `${ref.channelRef}:${ref.messageServerId || ref.messageClientId}`
}
