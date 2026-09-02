import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowReactive, shallowRef } from 'vue'
import type {
  Channel,
  ChannelAttachment,
  ChannelAttachmentPicker,
  ChannelDraft,
  ChannelDraftClient,
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
  MessageReply,
  Message,
  MessageMention,
  MessageReceiptDetails,
  MessageSearchPage,
  MessageSearchState,
  OutgoingMessageAttempt,
  OutgoingMessageContent,
  SearchMessagesRequest,
  SendMessageResult,
} from './contracts'
import { ChannelTransportError } from './contracts'
import {
  prepareChannelComposerSubmission,
  type ChannelComposerSubmission,
} from './channelComposerSubmission'
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

interface DraftDeliveryBatch {
  channelRef: ChannelRef
  text: string
  mentions: MessageMention[]
  pendingAttemptIds: Set<string>
}

export interface ChannelComposerSubmissionExecution {
  completion: Promise<void>
}

type MessageLoadDirection = 'before' | 'after'

const INITIAL_MESSAGE_LIMIT = 50
const SAVED_MESSAGE_LIMIT = 50
const MAX_CHANNEL_PAGES = 5
const DRAFT_SAVE_DELAY_MS = 300

export const useChannelsStore = defineStore('channels', () => {
  const transport = shallowRef<ChannelTransport | null>(null)
  const attachmentPicker = shallowRef<ChannelAttachmentPicker | null>(null)
  const draftClient = shallowRef<ChannelDraftClient | null>(null)
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
  const mutatingChannelRefs = reactive(new Set<ChannelRef>())
  const draftsByChannel = reactive(new Map<ChannelRef, ChannelDraft>())
  const draftSavingRefs = reactive(new Set<ChannelRef>())
  const loadingDrafts = ref(false)
  const draftErrorCode = ref<string | null>(null)
  const refreshingChannels = ref(false)
  const synchronizingChannels = ref(false)
  const channelCatalogReady = ref(true)
  const initialConversationSyncFinished = ref(false)
  const loadingMessageRequests = reactive(new Map<string, number>())
  const outgoingAttempts = shallowReactive(new Map<string, OutgoingMessageAttempt>())
  const draftDeliveryBatches = shallowReactive(new Map<string, DraftDeliveryBatch>())
  const attemptDeliveryBatchIds = shallowReactive(new Map<string, string>())
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
  let draftLoadOperationId = 0
  let loadedDraftAccountRef: string | null = null
  const dirtyDraftRefs = new Set<ChannelRef>()
  const draftSaveTimers = new Map<ChannelRef, ReturnType<typeof setTimeout>>()
  const draftSavePromises = new Map<ChannelRef, Promise<void>>()

  const channels = computed(() =>
    [...projection.channels.values()].sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.updatedAt - left.updatedAt ||
        left.ref.localeCompare(right.ref),
    ),
  )
  const pendingChannelRefs = computed(() => [...mutatingChannelRefs])
  const activeChannel = computed(() =>
    activeChannelRef.value ? (projection.channels.get(activeChannelRef.value) ?? null) : null,
  )
  const activeMessages = computed(() =>
    activeChannelRef.value ? (projection.messagesByChannel.get(activeChannelRef.value) ?? []) : [],
  )
  const activeOutgoingAttempts = computed(() =>
    [...outgoingAttempts.values()]
      .filter((attempt) => attempt.channelRef === activeChannelRef.value)
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.attemptId.localeCompare(right.attemptId),
      ),
  )
  const drafts = computed(() =>
    [...draftsByChannel.values()].sort(
      (left, right) =>
        right.updatedAt - left.updatedAt || left.channelRef.localeCompare(right.channelRef),
    ),
  )
  const activeDraft = computed(() =>
    activeChannelRef.value ? (draftsByChannel.get(activeChannelRef.value) ?? null) : null,
  )
  const activeDraftHasUnresolvedDelivery = computed(() =>
    [...outgoingAttempts.values()].some(
      (attempt) =>
        attempt.channelRef === activeChannelRef.value &&
        attemptDeliveryBatchIds.has(attempt.attemptId),
    ),
  )
  const draftSavingChannelRefs = computed(() => [...draftSavingRefs])
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

  function configure(
    value: ChannelTransport,
    picker?: ChannelAttachmentPicker,
    drafts?: ChannelDraftClient,
  ): void {
    if (transport.value === value && draftClient.value === drafts) return
    lifecycleGeneration += 1
    const generation = lifecycleGeneration
    unsubscribe?.()
    if (transport.value) void transport.value.dispose()
    void clearOutgoingAttempts(attachmentPicker.value)
    transport.value = value
    attachmentPicker.value = picker ?? null
    draftClient.value = drafts ?? null
    status.value = value.status()
    refreshPromise = null
    refreshingChannels.value = false
    synchronizingChannels.value = false
    loadingMessageRequests.clear()
    mutatingChannelRefs.clear()
    channelCatalogReady.value = false
    initialConversationSyncFinished.value = false
    unsubscribe = value.subscribe((event) => {
      if (generation === lifecycleGeneration && transport.value === value) handleEvent(event)
    })
    clearProjection()
    clearDraftProjection()
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
      if (status.value.accountRef && status.value.accountRef !== nextStatus.accountRef) {
        clearProjection()
        clearDraftProjection()
      }
      status.value = nextStatus
      await Promise.all([
        refreshChannels(),
        nextStatus.accountRef
          ? loadDrafts(nextStatus.accountRef).catch(() => undefined)
          : Promise.resolve(),
      ])
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
    await flushAllDrafts()
    await clearOutgoingAttempts(attachmentPicker.value)
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
    const previousChannelRef = activeChannelRef.value
    if (previousChannelRef && previousChannelRef !== channelRef)
      await flushDraft(previousChannelRef).catch(() => undefined)
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

  async function sendText(
    text: string,
    replyTo?: MessageRef,
    mentions?: MessageMention[],
  ): Promise<SendMessageResult | null> {
    const trimmed = text.trim()
    if (!trimmed) return null
    return sendContent(createTextMessageContent(trimmed), replyTo, mentions)
  }

  async function sendContent(
    content: OutgoingMessageContent,
    replyTo?: MessageRef,
    mentions?: MessageMention[],
  ): Promise<SendMessageResult | null> {
    const channelRef = activeChannelRef.value
    if (!channelRef) return null
    return startOutgoingContent(channelRef, content, replyTo, mentions).completion
  }

  async function beginComposerSubmission(
    submission: ChannelComposerSubmission,
  ): Promise<ChannelComposerSubmissionExecution | null> {
    const channelRef = activeChannelRef.value
    if (!channelRef || activeDraftHasUnresolvedDelivery.value) return null
    const deliveries = prepareChannelComposerSubmission(submission)
    if (!deliveries.length) return null

    const generation = lifecycleGeneration
    const durableText = submission.text.trim()
    if (durableText && draftClient.value) {
      updateDraft(channelRef, durableText, submission.mentions)
      await flushDraft(channelRef)
      if (generation !== lifecycleGeneration || activeChannelRef.value !== channelRef) return null
    }

    const attemptIds = deliveries.map((delivery) =>
      createOutgoingAttempt(channelRef, delivery.content, delivery.replyTo, delivery.mentions),
    )
    if (durableText && draftClient.value) {
      const batchId = randomOperationId()
      const batch: DraftDeliveryBatch = {
        channelRef,
        text: durableText,
        mentions: copyMessageMentions(submission.mentions),
        pendingAttemptIds: new Set(attemptIds),
      }
      draftDeliveryBatches.set(batchId, batch)
      for (const attemptId of attemptIds) attemptDeliveryBatchIds.set(attemptId, batchId)
    }
    const completions = attemptIds.map((attemptId) => executeOutgoingAttempt(attemptId))
    return {
      completion: Promise.allSettled(completions).then(() => undefined),
    }
  }

  function startOutgoingContent(
    channelRef: ChannelRef,
    content: OutgoingMessageContent,
    replyTo?: MessageRef,
    mentions?: MessageMention[],
  ): { attemptId: string; completion: Promise<SendMessageResult | null> } {
    const attemptId = createOutgoingAttempt(channelRef, content, replyTo, mentions)
    return { attemptId, completion: executeOutgoingAttempt(attemptId) }
  }

  function createOutgoingAttempt(
    channelRef: ChannelRef,
    content: OutgoingMessageContent,
    replyTo?: MessageRef,
    mentions?: MessageMention[],
  ): string {
    const attemptId = randomOperationId()
    const operationId = randomOperationId()
    const attempt: OutgoingMessageAttempt = {
      attemptId,
      idempotencyKey: randomIdempotencyKey(),
      operationId,
      channelRef,
      content: structuredClone(content),
      mentions: copyMessageMentions(mentions ?? []),
      ...(replyTo ? { replyTo: messageReplySnapshot(replyTo, activeMessages.value) } : {}),
      createdAt: Date.now(),
      status: 'sending',
      progress: 0,
      attemptNumber: 1,
      retryable: false,
    }
    outgoingAttempts.set(attemptId, attempt)
    errorCode.value = null
    return attemptId
  }

  async function executeOutgoingAttempt(attemptId: string): Promise<SendMessageResult | null> {
    const attempt = outgoingAttempts.get(attemptId)
    if (!attempt) return null
    const client = requireTransport()
    const picker = attachmentPicker.value
    const generation = lifecycleGeneration
    try {
      const result = attempt.replyTo
        ? await client.replyMessage({
            channelRef: attempt.channelRef,
            replyTo: attempt.replyTo.ref,
            content: structuredClone(attempt.content),
            ...(attempt.mentions.length ? { mentions: copyMessageMentions(attempt.mentions) } : {}),
            idempotencyKey: attempt.idempotencyKey,
            operationId: attempt.operationId,
          } satisfies ReplyMessageRequest)
        : await client.sendMessage({
            channelRef: attempt.channelRef,
            content: structuredClone(attempt.content),
            ...(attempt.mentions.length ? { mentions: copyMessageMentions(attempt.mentions) } : {}),
            idempotencyKey: attempt.idempotencyKey,
            operationId: attempt.operationId,
          })
      const current = outgoingAttempts.get(attemptId)
      if (current?.idempotencyKey === attempt.idempotencyKey) {
        outgoingAttempts.delete(attemptId)
        await releaseOutgoingContent(attempt.content, picker)
        await confirmDraftDeliveryAttempt(attemptId)
      }
      if (generation === lifecycleGeneration && transport.value === client) {
        return result
      }
      return null
    } catch (error) {
      if (generation === lifecycleGeneration && transport.value === client) {
        const current = outgoingAttempts.get(attemptId)
        if (current?.operationId === attempt.operationId && current.status !== 'cancelled') {
          const failure = outgoingAttemptFailure(error)
          outgoingAttempts.set(attemptId, {
            ...current,
            status: 'failed',
            progress: 0,
            errorCode: failure.errorCode,
            retryable: failure.retryable,
          })
          errorCode.value = failure.errorCode
        }
      }
      throw error
    }
  }

  async function retryOutgoingMessage(attemptId: string): Promise<SendMessageResult | null> {
    const attempt = outgoingAttempts.get(attemptId)
    if (!attempt || attempt.status === 'sending' || !attempt.retryable) return null
    outgoingAttempts.set(attemptId, {
      ...attempt,
      operationId: randomOperationId(),
      status: 'sending',
      progress: 0,
      attemptNumber: attempt.attemptNumber + 1,
      retryable: false,
      errorCode: undefined,
    })
    errorCode.value = null
    return executeOutgoingAttempt(attemptId)
  }

  async function cancelOutgoingMessage(attemptId: string): Promise<void> {
    const attempt = outgoingAttempts.get(attemptId)
    if (!attempt || attempt.status !== 'sending') return
    outgoingAttempts.set(attemptId, {
      ...attempt,
      status: 'cancelled',
      progress: 0,
      retryable: true,
      errorCode: undefined,
    })
    try {
      await requireTransport().cancelMessageSend(attempt.operationId)
    } catch (error) {
      const current = outgoingAttempts.get(attemptId)
      if (current?.operationId === attempt.operationId) {
        const failure = outgoingAttemptFailure(error)
        outgoingAttempts.set(attemptId, {
          ...current,
          status: 'failed',
          errorCode: failure.errorCode,
          retryable: failure.retryable,
        })
        errorCode.value = failure.errorCode
      }
      throw error
    }
  }

  async function dismissOutgoingMessage(attemptId: string): Promise<void> {
    const attempt = outgoingAttempts.get(attemptId)
    if (!attempt || attempt.status === 'sending') return
    outgoingAttempts.delete(attemptId)
    abandonDraftDeliveryAttempt(attemptId)
    await releaseOutgoingContent(attempt.content, attachmentPicker.value)
  }

  async function releaseAttachment(token: string): Promise<void> {
    await attachmentPicker.value?.release(token)
  }

  async function cancelSend(operationId?: string): Promise<void> {
    if (!operationId) return
    const attempt = [...outgoingAttempts.values()].find(
      (candidate) => candidate.operationId === operationId,
    )
    if (attempt) await cancelOutgoingMessage(attempt.attemptId)
    else await requireTransport().cancelMessageSend(operationId)
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

  async function getMessageReceiptDetails(messageRef: MessageRef): Promise<MessageReceiptDetails> {
    const client = requireTransport()
    try {
      return structuredClone(await client.getMessageReceiptDetails(messageRef))
    } catch (error) {
      errorCode.value = transportErrorCode(error)
      throw error
    }
  }

  async function openDirectConversation(accountId: string): Promise<ChannelRef> {
    const client = requireTransport()
    const channelRef = await client.openDirectConversation(accountId)
    activeChannelRef.value = channelRef
    await refreshChannels()
    return channelRef
  }

  async function setChannelPinned(channelRef: ChannelRef, pinned: boolean): Promise<void> {
    await mutateChannel(
      channelRef,
      (client) => client.setChannelPinned(channelRef, pinned),
      (channel) => ({ ...channel, pinned }),
    )
  }

  async function setChannelMuted(channelRef: ChannelRef, muted: boolean): Promise<void> {
    await mutateChannel(
      channelRef,
      (client) => client.setChannelMuted(channelRef, muted),
      (channel) => ({ ...channel, muted }),
    )
  }

  async function markChannelRead(channelRef: ChannelRef): Promise<void> {
    await mutateChannel(
      channelRef,
      (client) => client.markRead(channelRef),
      (channel) => ({ ...channel, unreadCount: 0 }),
    )
  }

  async function hideChannel(channelRef: ChannelRef): Promise<void> {
    await mutateChannel(
      channelRef,
      (client) => client.hideChannel(channelRef),
      () => null,
    )
  }

  function updateDraft(channelRef: ChannelRef, text: string, mentions: MessageMention[]): void {
    const accountRef = status.value.accountRef
    if (
      !accountRef ||
      loadedDraftAccountRef !== accountRef ||
      !draftClient.value ||
      !projection.channels.has(channelRef)
    )
      return
    draftsByChannel.set(channelRef, {
      accountRef,
      channelRef,
      text,
      mentions: copyMessageMentions(mentions),
      updatedAt: Date.now(),
    })
    dirtyDraftRefs.add(channelRef)
    draftErrorCode.value = null
    scheduleDraftSave(channelRef)
  }

  async function clearDraft(channelRef: ChannelRef): Promise<void> {
    if (!status.value.accountRef || !draftClient.value) return
    const previous = draftsByChannel.get(channelRef)
    draftsByChannel.delete(channelRef)
    dirtyDraftRefs.add(channelRef)
    try {
      await flushDraft(channelRef)
    } catch (error) {
      if (previous && !draftsByChannel.has(channelRef)) {
        draftsByChannel.set(channelRef, previous)
        dirtyDraftRefs.add(channelRef)
      }
      throw error
    }
  }

  async function loadDrafts(accountRef: string): Promise<void> {
    const client = draftClient.value
    if (!client) return
    if (loadedDraftAccountRef !== accountRef) {
      clearDraftProjection()
      loadedDraftAccountRef = accountRef
    }
    const generation = lifecycleGeneration
    const operationId = ++draftLoadOperationId
    loadingDrafts.value = true
    draftErrorCode.value = null
    try {
      const values = await client.list(accountRef)
      if (
        generation !== lifecycleGeneration ||
        draftClient.value !== client ||
        operationId !== draftLoadOperationId ||
        status.value.accountRef !== accountRef
      )
        return
      draftsByChannel.clear()
      for (const draft of values) {
        if (draft.accountRef === accountRef) draftsByChannel.set(draft.channelRef, draft)
      }
    } catch (error) {
      if (generation === lifecycleGeneration && operationId === draftLoadOperationId)
        draftErrorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration && operationId === draftLoadOperationId)
        loadingDrafts.value = false
    }
  }

  function scheduleDraftSave(channelRef: ChannelRef): void {
    const existing = draftSaveTimers.get(channelRef)
    if (existing) clearTimeout(existing)
    draftSaveTimers.set(
      channelRef,
      setTimeout(() => {
        draftSaveTimers.delete(channelRef)
        void flushDraft(channelRef).catch(() => undefined)
      }, DRAFT_SAVE_DELAY_MS),
    )
  }

  async function flushDraft(channelRef: ChannelRef): Promise<void> {
    const timer = draftSaveTimers.get(channelRef)
    if (timer) {
      clearTimeout(timer)
      draftSaveTimers.delete(channelRef)
    }
    const current = draftSavePromises.get(channelRef)
    if (current) return current
    if (!dirtyDraftRefs.has(channelRef)) return
    const client = draftClient.value
    const accountRef = status.value.accountRef
    if (!client || !accountRef) return
    const generation = lifecycleGeneration
    const operation = (async () => {
      draftSavingRefs.add(channelRef)
      while (
        generation === lifecycleGeneration &&
        draftClient.value === client &&
        status.value.accountRef === accountRef &&
        dirtyDraftRefs.has(channelRef)
      ) {
        dirtyDraftRefs.delete(channelRef)
        const draft = draftsByChannel.get(channelRef)
        try {
          if (draft?.text.trim()) {
            await client.save({
              accountRef,
              channelRef,
              text: draft.text,
              mentions: copyMessageMentions(draft.mentions),
            })
          } else {
            await client.remove(accountRef, channelRef)
          }
          if (generation === lifecycleGeneration && status.value.accountRef === accountRef)
            draftErrorCode.value = null
        } catch (error) {
          if (
            generation === lifecycleGeneration &&
            draftClient.value === client &&
            status.value.accountRef === accountRef
          ) {
            dirtyDraftRefs.add(channelRef)
            draftErrorCode.value = transportErrorCode(error)
          }
          throw error
        }
      }
    })().finally(() => {
      draftSavingRefs.delete(channelRef)
      draftSavePromises.delete(channelRef)
      if (dirtyDraftRefs.has(channelRef) && status.value.accountRef !== accountRef)
        scheduleDraftSave(channelRef)
    })
    draftSavePromises.set(channelRef, operation)
    return operation
  }

  async function flushAllDrafts(): Promise<void> {
    const channelRefs = new Set([...dirtyDraftRefs, ...draftSaveTimers.keys()])
    await Promise.allSettled([...channelRefs].map((channelRef) => flushDraft(channelRef)))
  }

  async function dispose(): Promise<void> {
    await flushAllDrafts()
    await clearOutgoingAttempts(attachmentPicker.value)
    lifecycleGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    const client = transport.value
    transport.value = null
    attachmentPicker.value = null
    draftClient.value = null
    clearProjection()
    refreshPromise = null
    refreshingChannels.value = false
    synchronizingChannels.value = false
    channelCatalogReady.value = true
    initialConversationSyncFinished.value = false
    loadingMessageRequests.clear()
    mutatingMessage.value = false
    mutatingChannelRefs.clear()
    errorCode.value = null
    clearDraftProjection()
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
      clearDraftProjection()
      channelCatalogReady.value = false
      initialConversationSyncFinished.value = false
    }
    status.value = event.type === 'status.changed' ? event.status : status.value
    reduceChannelEvent(projection, event)
    if (
      event.type === 'channel.deleted' &&
      activeChannelRef.value &&
      event.channelRefs.includes(activeChannelRef.value)
    )
      activeChannelRef.value = null
    reconcileMessageCursors(event)
    reconcilePinnedMessages(event)
    reconcileOutgoingAttempts(event)
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
      if (event.status.phase === 'connected') {
        void refreshChannels().catch(() => undefined)
        if (event.status.accountRef) void loadDrafts(event.status.accountRef).catch(() => undefined)
      }
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
      const attempt = [...outgoingAttempts.values()].find(
        (candidate) => candidate.operationId === event.operationId,
      )
      if (attempt?.status === 'sending')
        outgoingAttempts.set(attempt.attemptId, {
          ...attempt,
          progress: Math.max(0, Math.min(100, event.progress)),
        })
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
    void clearOutgoingAttempts(attachmentPicker.value)
  }

  function reconcileOutgoingAttempts(event: ChannelEvent): void {
    if (event.type === 'message.upserted') {
      for (const message of event.messages) {
        if (!message.clientReference) continue
        const attempt = [...outgoingAttempts.values()].find(
          (candidate) => candidate.idempotencyKey === message.clientReference,
        )
        if (!attempt) continue
        outgoingAttempts.delete(attempt.attemptId)
        void releaseOutgoingContent(attempt.content, attachmentPicker.value)
        void confirmDraftDeliveryAttempt(attempt.attemptId)
      }
      return
    }
    if (event.type === 'channel.deleted') {
      for (const attempt of [...outgoingAttempts.values()]) {
        if (!event.channelRefs.includes(attempt.channelRef)) continue
        outgoingAttempts.delete(attempt.attemptId)
        abandonDraftDeliveryAttempt(attempt.attemptId)
        void releaseOutgoingContent(attempt.content, attachmentPicker.value)
      }
    }
  }

  async function clearOutgoingAttempts(picker: ChannelAttachmentPicker | null): Promise<void> {
    const attempts = [...outgoingAttempts.values()]
    outgoingAttempts.clear()
    clearDraftDeliveryBatches()
    await Promise.allSettled(
      attempts.map((attempt) => releaseOutgoingContent(attempt.content, picker)),
    )
  }

  function clearDraftProjection(): void {
    draftLoadOperationId += 1
    for (const timer of draftSaveTimers.values()) clearTimeout(timer)
    draftSaveTimers.clear()
    dirtyDraftRefs.clear()
    draftsByChannel.clear()
    draftSavingRefs.clear()
    loadingDrafts.value = false
    draftErrorCode.value = null
    loadedDraftAccountRef = null
    clearDraftDeliveryBatches()
  }

  async function confirmDraftDeliveryAttempt(attemptId: string): Promise<void> {
    const batchId = attemptDeliveryBatchIds.get(attemptId)
    if (!batchId) return
    attemptDeliveryBatchIds.delete(attemptId)
    const batch = draftDeliveryBatches.get(batchId)
    if (!batch) return
    batch.pendingAttemptIds.delete(attemptId)
    if (batch.pendingAttemptIds.size) return
    draftDeliveryBatches.delete(batchId)
    const draft = draftsByChannel.get(batch.channelRef)
    if (!draft || !sameDraftContent(draft, batch.text, batch.mentions)) return
    try {
      await clearDraft(batch.channelRef)
    } catch {
      // Delivery is confirmed. The restored draft and stable error preserve recovery.
    }
  }

  function abandonDraftDeliveryAttempt(attemptId: string): void {
    const batchId = attemptDeliveryBatchIds.get(attemptId)
    if (!batchId) return
    const batch = draftDeliveryBatches.get(batchId)
    if (batch)
      for (const pendingAttemptId of batch.pendingAttemptIds)
        attemptDeliveryBatchIds.delete(pendingAttemptId)
    draftDeliveryBatches.delete(batchId)
  }

  function clearDraftDeliveryBatches(): void {
    draftDeliveryBatches.clear()
    attemptDeliveryBatchIds.clear()
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

  async function mutateChannel(
    channelRef: ChannelRef,
    operation: (client: ChannelTransport) => Promise<void>,
    project: (channel: Channel) => Channel | null,
  ): Promise<void> {
    if (mutatingChannelRefs.has(channelRef)) return
    const current = projection.channels.get(channelRef)
    if (!current) throw new ChannelTransportError('invalidRequest', false)
    const client = requireTransport()
    const generation = lifecycleGeneration
    mutatingChannelRefs.add(channelRef)
    errorCode.value = null
    try {
      await operation(client)
      if (generation !== lifecycleGeneration || transport.value !== client) return
      const next = project(projection.channels.get(channelRef) ?? current)
      if (next) projection.channels.set(channelRef, next)
      else {
        projection.channels.delete(channelRef)
        projection.messagesByChannel.delete(channelRef)
        messageCursors.delete(channelRef)
        if (activeChannelRef.value === channelRef) activeChannelRef.value = null
      }
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) mutatingChannelRefs.delete(channelRef)
    }
  }

  return {
    channels,
    activeChannelRef,
    highlightedMessageKey,
    activeChannel,
    activeMessages,
    activeOutgoingAttempts,
    drafts,
    activeDraft,
    activeDraftHasUnresolvedDelivery,
    loadingDrafts,
    draftSavingChannelRefs,
    draftErrorCode,
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
    pendingChannelRefs,
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
    beginComposerSubmission,
    pickAttachments,
    releaseAttachment,
    cancelSend,
    retryOutgoingMessage,
    cancelOutgoingMessage,
    dismissOutgoingMessage,
    forwardMessage,
    loadMergedMessages,
    modifyMessage,
    deleteMessages,
    revokeMessage,
    pinMessage,
    quickComment,
    getMessageReceiptDetails,
    openDirectConversation,
    setChannelPinned,
    setChannelMuted,
    markChannelRead,
    hideChannel,
    updateDraft,
    flushDraft,
    clearDraft,
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

function copyMessageMentions(mentions: MessageMention[]): MessageMention[] {
  return mentions.map((mention) => ({
    target:
      mention.target.kind === 'channel'
        ? { kind: 'channel' }
        : { kind: 'user', accountId: mention.target.accountId },
    label: mention.label,
    ranges: mention.ranges.map((range) => ({ start: range.start, end: range.end })),
  }))
}

function sameDraftContent(draft: ChannelDraft, text: string, mentions: MessageMention[]): boolean {
  if (draft.text !== text || draft.mentions.length !== mentions.length) return false
  return draft.mentions.every((mention, index) => {
    const expected = mentions[index]
    if (!expected || mention.target.kind !== expected.target.kind) return false
    if (
      mention.target.kind === 'user' &&
      (expected.target.kind !== 'user' || mention.target.accountId !== expected.target.accountId)
    )
      return false
    return (
      mention.label === expected.label &&
      mention.ranges.length === expected.ranges.length &&
      mention.ranges.every(
        (range, rangeIndex) =>
          range.start === expected.ranges[rangeIndex]?.start &&
          range.end === expected.ranges[rangeIndex]?.end,
      )
    )
  })
}

function randomOperationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `send-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

function randomIdempotencyKey(): string {
  return `im-send:v1:${randomOperationId()}`
}

function messageReplySnapshot(ref: MessageRef, messages: Message[]): MessageReply {
  const message = messages.find((candidate) => sameMessage(candidate.ref, ref))
  return {
    ref: structuredClone(ref),
    senderName: message?.sender.name ?? '',
    text: message?.text ?? '',
  }
}

function outgoingAttemptFailure(error: unknown): { errorCode: string; retryable: boolean } {
  return {
    errorCode: transportErrorCode(error),
    retryable:
      error instanceof ChannelTransportError ||
      (typeof error === 'object' && error !== null && 'retryable' in error)
        ? Boolean(error.retryable)
        : true,
  }
}

function mediaToken(content: OutgoingMessageContent): string | undefined {
  if (
    content.kind === 'image' ||
    content.kind === 'audio' ||
    content.kind === 'video' ||
    content.kind === 'file'
  )
    return content.media.source.token
  return undefined
}

async function releaseOutgoingContent(
  content: OutgoingMessageContent,
  picker: ChannelAttachmentPicker | null,
): Promise<void> {
  const token = mediaToken(content)
  if (!token || !picker) return
  try {
    await picker.release(token)
  } catch {
    // A confirmed provider send remains successful; picker handles also expire in main.
  }
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
