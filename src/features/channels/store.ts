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
  ChannelThread,
  ChannelMemberPage,
  ChannelMediaClient,
  ChannelMediaSaveErrorCode,
  ChannelMediaSaveProgressEvent,
  ChannelMediaSaveState,
  ChannelPresence,
  ChannelRef,
  ChannelStatus,
  ChannelTransport,
  ChannelVoicePlaybackClient,
  ChannelVoicePlaybackErrorCode,
  ChannelVoicePlaybackEvent,
  ChannelVoicePlaybackRate,
  ChannelVoicePlaybackState,
  ChannelVoiceTranscript,
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
import {
  CHANNEL_VOICE_PLAYBACK_RATES,
  ChannelTransportError,
  ChannelMediaClientError,
  ChannelVoicePlaybackClientError,
} from './contracts'
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
import { debugQuickComment } from './quickCommentDebug'

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

interface VoicePlaybackTarget {
  key: string
  messageRef: MessageRef
  sourceUrl: string
  durationMs: number
}

export interface ChannelComposerSubmissionExecution {
  completion: Promise<void>
}

type MessageLoadDirection = 'before' | 'after'

const INITIAL_MESSAGE_LIMIT = 50
const SAVED_MESSAGE_LIMIT = 50
const MAX_CHANNEL_PAGES = 5
const DRAFT_SAVE_DELAY_MS = 300
const MAX_VOICE_PLAYBACK_BOOKMARKS = 128
const MAX_MEDIA_SAVE_PROJECTIONS = 128
const MAX_VOICE_DURATION_MS = 24 * 60 * 60 * 1_000

export const useChannelsStore = defineStore('channels', () => {
  const transport = shallowRef<ChannelTransport | null>(null)
  const attachmentPicker = shallowRef<ChannelAttachmentPicker | null>(null)
  const draftClient = shallowRef<ChannelDraftClient | null>(null)
  const voicePlaybackClient = shallowRef<ChannelVoicePlaybackClient | null>(null)
  const mediaClient = shallowRef<ChannelMediaClient | null>(null)
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
  const threadRootRef = ref<MessageRef | null>(null)
  const thread = shallowRef<ChannelThread | null>(null)
  const loadingThread = ref(false)
  const threadErrorCode = ref<string | null>(null)
  const errorCode = ref<string | null>(null)
  const presenceByAccount = reactive(new Map<string, ChannelPresence>())
  const presenceErrorCode = ref<string | null>(null)
  const voiceTranscriptsByMessage = reactive(new Map<string, ChannelVoiceTranscript>())
  const voicePlaybacksByMessage = reactive(new Map<string, ChannelVoicePlaybackState>())
  const mediaSavesByMessage = reactive(new Map<string, ChannelMediaSaveState>())
  const mediaViewerRef = ref<MessageRef | null>(null)
  const voicePlaybackRate = ref<ChannelVoicePlaybackRate>(1)
  let unsubscribe: (() => void) | null = null
  let refreshPromise: Promise<void> | null = null
  let lifecycleGeneration = 0
  let channelSelectionOperationId = 0
  let loadingMessageOperationId = 0
  let messageSearchOperationId = 0
  let pinnedMessagesOperationId = 0
  let savedMessagesOperationId = 0
  let mergedMessagesOperationId = 0
  let threadOperationId = 0
  let draftLoadOperationId = 0
  let loadedDraftAccountRef: string | null = null
  let presenceGeneration = 0
  let presenceTargetKey: string | null = null
  let presenceSynchronization: Promise<void> = Promise.resolve()
  let voiceTranscriptionOperationId = 0
  const voiceTranscriptionOperations = new Map<string, Promise<void>>()
  const voiceTranscriptionOperationIds = new Map<string, number>()
  const voicePlaybackSources = new Map<string, string>()
  let voicePlaybackGeneration = 0
  let activeVoicePlaybackKey: string | null = null
  const mediaSaveSources = new Map<string, string>()
  let mediaSaveGeneration = 0
  let activeMediaSaveOperationId: string | null = null
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
  const presences = computed(() =>
    desiredPresenceAccountIds().map(
      (accountId) =>
        presenceByAccount.get(accountId) ?? {
          accountId,
          availability: 'unknown' as const,
          updatedAt: 0,
        },
    ),
  )
  const pendingChannelRefs = computed(() => [...mutatingChannelRefs])
  const activeChannel = computed(() =>
    activeChannelRef.value ? (projection.channels.get(activeChannelRef.value) ?? null) : null,
  )
  const activePresence = computed(() => {
    const accountId = activeChannel.value?.directAccountId
    if (!accountId) return null
    return (
      presenceByAccount.get(accountId) ?? {
        accountId,
        availability: 'unknown' as const,
        updatedAt: 0,
      }
    )
  })
  const activeMessages = computed(() =>
    activeChannelRef.value ? (projection.messagesByChannel.get(activeChannelRef.value) ?? []) : [],
  )
  const activeVoiceTranscripts = computed(() =>
    [...voiceTranscriptsByMessage.values()].filter(
      (transcript) => transcript.messageRef.channelRef === activeChannelRef.value,
    ),
  )
  const activeVoicePlaybacks = computed(() =>
    [...voicePlaybacksByMessage.values()].filter(
      (playback) => playback.messageRef.channelRef === activeChannelRef.value,
    ),
  )
  const voicePlaybackAvailable = computed(() => voicePlaybackClient.value !== null)
  const activeMediaSaves = computed(() =>
    [...mediaSavesByMessage.values()].filter(
      (state) => state.messageRef.channelRef === activeChannelRef.value,
    ),
  )
  const mediaSavingAvailable = computed(() => mediaClient.value !== null)
  const viewableMediaMessages = computed(() =>
    activeMessages.value.filter((message) => isViewableMediaMessage(message)),
  )
  const mediaViewerMessage = computed(() => {
    const target = mediaViewerRef.value
    if (!target) return null
    return viewableMediaMessages.value.find((message) => sameMessage(message.ref, target)) ?? null
  })
  const mediaViewerIndex = computed(() => {
    const target = mediaViewerRef.value
    return target
      ? viewableMediaMessages.value.findIndex((message) => sameMessage(message.ref, target))
      : -1
  })
  const mediaViewerCanGoPrevious = computed(() => mediaViewerIndex.value > 0)
  const mediaViewerCanGoNext = computed(
    () =>
      mediaViewerIndex.value >= 0 &&
      mediaViewerIndex.value < viewableMediaMessages.value.length - 1,
  )
  const activeOutgoingAttempts = computed(() =>
    [...outgoingAttempts.values()]
      .filter((attempt) => attempt.channelRef === activeChannelRef.value)
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.attemptId.localeCompare(right.attemptId),
      ),
  )
  const activeThreadOutgoingAttempts = computed(() => {
    const root = threadRootRef.value
    if (!root) return []
    return [...outgoingAttempts.values()]
      .filter(
        (attempt) =>
          attempt.channelRef === root.channelRef &&
          attempt.replyTo &&
          sameMessage(attempt.replyTo.ref, root),
      )
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.attemptId.localeCompare(right.attemptId),
      )
  })
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
    playback?: ChannelVoicePlaybackClient,
    media?: ChannelMediaClient,
  ): void {
    if (
      transport.value === value &&
      draftClient.value === drafts &&
      voicePlaybackClient.value === playback &&
      mediaClient.value === media
    )
      return
    const previousPlayback = voicePlaybackClient.value
    const previousMedia = mediaClient.value
    clearVoicePlaybackProjection()
    clearMediaProjection(previousMedia)
    if (previousPlayback && previousPlayback !== playback) previousPlayback.dispose()
    if (previousMedia && previousMedia !== media) void previousMedia.dispose()
    voicePlaybackClient.value = null
    mediaClient.value = null
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
    voicePlaybackClient.value = playback ?? null
    mediaClient.value = media ?? null
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
    clearVoiceTranscriptProjection()
    clearVoicePlaybackProjection()
    clearMediaProjection()
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
        await synchronizePresenceTargets()
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
    const operationId = ++channelSelectionOperationId
    errorCode.value = null

    // Reading history and flushing the previous draft are independent from the
    // provider read marker, so start the durable update immediately on selection.
    const markReadPromise = markSelectedChannelRead(client, channelRef, generation, operationId)
    const previousChannelRef = activeChannelRef.value
    try {
      if (previousChannelRef && previousChannelRef !== channelRef) closeThread()
      if (previousChannelRef && previousChannelRef !== channelRef) pauseVoicePlayback()
      if (previousChannelRef && previousChannelRef !== channelRef) closeMediaViewer()
      if (previousChannelRef && previousChannelRef !== channelRef)
        await flushDraft(previousChannelRef).catch(() => undefined)
      if (
        generation !== lifecycleGeneration ||
        transport.value !== client ||
        !projection.channels.has(channelRef)
      )
        return
      highlightedMessageKey.value = null
      if (pinnedMessagesChannelRef.value !== channelRef) clearPinnedMessages()
      activeChannelRef.value = channelRef
      if (!projection.messagesByChannel.has(channelRef)) await loadMessages(channelRef, 'before')
      else ensureMessageCursor(channelRef)
    } finally {
      await markReadPromise
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
    debugQuickComment('store.request', {
      ref: request.messageRef,
      type: request.type,
      active: request.active,
      status: status.value,
    })
    try {
      await mutateMessage((client) => client.quickComment(request))
      debugQuickComment('store.success', {
        ref: request.messageRef,
        type: request.type,
        active: request.active,
      })
    } catch (error) {
      debugQuickComment('store.failure', {
        ref: request.messageRef,
        type: request.type,
        active: request.active,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async function transcribeVoice(messageRef: MessageRef): Promise<void> {
    const client = requireTransport()
    const message = (projection.messagesByChannel.get(messageRef.channelRef) ?? []).find(
      (candidate) => sameMessage(candidate.ref, messageRef),
    )
    if (!message || message.state !== 'active' || message.content.kind !== 'audio')
      throw new ChannelTransportError('invalidRequest', false)

    const ref = copyMessageRef(message.ref)
    const key = messageKey(ref)
    if (voiceTranscriptsByMessage.get(key)?.status === 'ready') return
    const pending = voiceTranscriptionOperations.get(key)
    if (pending) return pending
    if (
      !client
        .capabilities()
        .some((capability) => capability.id === 'message.voice.transcribe' && capability.available)
    )
      throw new ChannelTransportError('unsupportedCapability', false)

    const generation = lifecycleGeneration
    voiceTranscriptsByMessage.set(key, {
      messageRef: ref,
      status: 'loading',
      retryable: false,
    })
    const operationId = ++voiceTranscriptionOperationId
    voiceTranscriptionOperationIds.set(key, operationId)
    const transcription = (() => {
      try {
        return Promise.resolve(client.transcribeVoice(ref))
      } catch (error) {
        return Promise.reject(error)
      }
    })()
    const operation = (async () => {
      try {
        const value = await transcription
        const text = value.trim()
        if (!text || text.length > 32_768) throw new ChannelTransportError('protocolFailure', false)
        if (!hasVoiceTranscriptionContext(client, generation, key, operationId)) return
        voiceTranscriptsByMessage.set(key, {
          messageRef: ref,
          status: 'ready',
          text,
          retryable: false,
        })
      } catch (error) {
        if (!hasVoiceTranscriptionContext(client, generation, key, operationId)) return
        voiceTranscriptsByMessage.set(key, {
          messageRef: ref,
          status: 'failed',
          errorCode: transportErrorCode(error),
          retryable: transportErrorRetryable(error),
        })
        throw error
      } finally {
        if (voiceTranscriptionOperationIds.get(key) === operationId) {
          voiceTranscriptionOperations.delete(key)
          voiceTranscriptionOperationIds.delete(key)
        }
      }
    })()
    voiceTranscriptionOperations.set(key, operation)
    return operation
  }

  async function toggleVoicePlayback(messageRef: MessageRef): Promise<void> {
    const target = voicePlaybackTarget(messageRef)
    const current = voicePlaybacksByMessage.get(target.key)
    if (
      activeVoicePlaybackKey === target.key &&
      (current?.status === 'loading' || current?.status === 'playing')
    ) {
      pauseVoicePlayback()
      return
    }
    await startVoicePlayback(target)
  }

  async function retryVoicePlayback(messageRef: MessageRef): Promise<void> {
    await startVoicePlayback(voicePlaybackTarget(messageRef))
  }

  function pauseVoicePlayback(): void {
    const key = activeVoicePlaybackKey
    if (!key) return
    const current = voicePlaybacksByMessage.get(key)
    if (!current || (current.status !== 'loading' && current.status !== 'playing')) return
    voicePlaybackGeneration += 1
    if (current.status === 'loading') voicePlaybackClient.value?.stop()
    else voicePlaybackClient.value?.pause()
    setVoicePlaybackState(key, {
      ...current,
      status: 'paused',
      errorCode: undefined,
      retryable: false,
    })
  }

  function seekVoicePlayback(messageRef: MessageRef, positionMs: number): void {
    if (!Number.isFinite(positionMs)) throw new ChannelTransportError('invalidRequest', false)
    const target = voicePlaybackTarget(messageRef)
    const current = voicePlaybacksByMessage.get(target.key)
    const durationMs = current?.durationMs || target.durationMs
    const nextPosition = clampMilliseconds(positionMs, durationMs)
    setVoicePlaybackState(target.key, {
      messageRef: target.messageRef,
      status: current?.status ?? 'paused',
      positionMs: nextPosition,
      durationMs,
      playbackRate: voicePlaybackRate.value,
      ...(current?.errorCode ? { errorCode: current.errorCode } : {}),
      retryable: current?.retryable ?? false,
    })
    if (activeVoicePlaybackKey === target.key) voicePlaybackClient.value?.seek(nextPosition)
  }

  function setVoicePlaybackRate(rate: ChannelVoicePlaybackRate): void {
    if (!CHANNEL_VOICE_PLAYBACK_RATES.includes(rate))
      throw new ChannelTransportError('invalidRequest', false)
    voicePlaybackRate.value = rate
    for (const [key, current] of [...voicePlaybacksByMessage])
      setVoicePlaybackState(key, { ...current, playbackRate: rate })
    if (activeVoicePlaybackKey) voicePlaybackClient.value?.setPlaybackRate(rate)
  }

  async function startVoicePlayback(target: VoicePlaybackTarget): Promise<void> {
    const player = voicePlaybackClient.value
    if (!player) throw new ChannelTransportError('unsupportedCapability', false)
    if (activeVoicePlaybackKey && activeVoicePlaybackKey !== target.key)
      suspendCurrentVoicePlayback()
    const current = voicePlaybacksByMessage.get(target.key)
    const generation = ++voicePlaybackGeneration
    activeVoicePlaybackKey = target.key
    voicePlaybackSources.set(target.key, target.sourceUrl)
    setVoicePlaybackState(target.key, {
      messageRef: target.messageRef,
      status: 'loading',
      positionMs: current?.positionMs ?? 0,
      durationMs: current?.durationMs || target.durationMs,
      playbackRate: voicePlaybackRate.value,
      retryable: false,
    })
    const listener = (event: ChannelVoicePlaybackEvent) =>
      handleVoicePlaybackEvent(player, generation, target.key, event)
    let operation: Promise<void>
    try {
      operation = Promise.resolve(
        player.play(
          {
            messageRef: target.messageRef,
            sourceUrl: target.sourceUrl,
            durationMs: target.durationMs,
            startAtMs: current?.positionMs ?? 0,
            playbackRate: voicePlaybackRate.value,
          },
          listener,
        ),
      )
    } catch (error) {
      operation = Promise.reject(error)
    }
    try {
      await operation
    } catch (error) {
      if (hasVoicePlaybackContext(player, generation, target.key)) {
        const failure = voicePlaybackFailure(error)
        const state = voicePlaybacksByMessage.get(target.key)
        if (state)
          setVoicePlaybackState(target.key, {
            ...state,
            status: 'failed',
            errorCode: failure.errorCode,
            retryable: failure.retryable,
          })
      }
      throw error
    }
  }

  function handleVoicePlaybackEvent(
    player: ChannelVoicePlaybackClient,
    generation: number,
    key: string,
    event: ChannelVoicePlaybackEvent,
  ): void {
    if (!hasVoicePlaybackContext(player, generation, key)) return
    const current = voicePlaybacksByMessage.get(key)
    if (!current) return
    if (current.status === 'failed' && event.type !== 'failed') return
    if (event.type === 'progress') {
      const durationMs = boundedVoiceMilliseconds(event.durationMs) || current.durationMs
      setVoicePlaybackState(key, {
        ...current,
        positionMs: clampMilliseconds(event.positionMs, durationMs),
        durationMs,
      })
      return
    }
    if (event.type === 'failed') {
      setVoicePlaybackState(key, {
        ...current,
        status: 'failed',
        errorCode: event.errorCode,
        retryable: event.retryable,
      })
      return
    }
    setVoicePlaybackState(key, {
      ...current,
      status: event.type === 'playing' ? 'playing' : 'paused',
      ...(event.type === 'ended' ? { positionMs: 0 } : {}),
      errorCode: undefined,
      retryable: false,
    })
  }

  function hasVoicePlaybackContext(
    player: ChannelVoicePlaybackClient,
    generation: number,
    key: string,
  ): boolean {
    return (
      voicePlaybackClient.value === player &&
      voicePlaybackGeneration === generation &&
      activeVoicePlaybackKey === key
    )
  }

  function suspendCurrentVoicePlayback(): void {
    const key = activeVoicePlaybackKey
    if (!key) return
    voicePlaybackGeneration += 1
    voicePlaybackClient.value?.stop()
    const current = voicePlaybacksByMessage.get(key)
    if (current && (current.status === 'loading' || current.status === 'playing'))
      setVoicePlaybackState(key, {
        ...current,
        status: 'paused',
        errorCode: undefined,
        retryable: false,
      })
    activeVoicePlaybackKey = null
  }

  function setVoicePlaybackState(key: string, state: ChannelVoicePlaybackState): void {
    voicePlaybacksByMessage.delete(key)
    voicePlaybacksByMessage.set(key, {
      ...state,
      messageRef: copyMessageRef(state.messageRef),
    })
    while (voicePlaybacksByMessage.size > MAX_VOICE_PLAYBACK_BOOKMARKS) {
      const oldest = voicePlaybacksByMessage.keys().next().value
      if (typeof oldest !== 'string') break
      voicePlaybacksByMessage.delete(oldest)
      voicePlaybackSources.delete(oldest)
    }
  }

  function voicePlaybackTarget(messageRef: MessageRef): VoicePlaybackTarget {
    const message = (projection.messagesByChannel.get(messageRef.channelRef) ?? []).find(
      (candidate) => sameMessage(candidate.ref, messageRef),
    )
    if (
      !message ||
      message.state !== 'active' ||
      message.content.kind !== 'audio' ||
      !message.content.media.url
    )
      throw new ChannelTransportError('invalidRequest', false)
    const sourceUrl = message.content.media.url.trim()
    if (!sourceUrl || sourceUrl.length > 2_048)
      throw new ChannelTransportError('invalidRequest', false)
    return {
      key: messageKey(message.ref),
      messageRef: copyMessageRef(message.ref),
      sourceUrl,
      durationMs: boundedVoiceMilliseconds(message.content.media.durationMs ?? 0),
    }
  }

  function openMediaViewer(messageRef: MessageRef): void {
    const message = messageForRef(messageRef)
    if (!message || !isViewableMediaMessage(message))
      throw new ChannelTransportError('invalidRequest', false)
    mediaViewerRef.value = copyMessageRef(message.ref)
  }

  function closeMediaViewer(): void {
    mediaViewerRef.value = null
  }

  function navigateMediaViewer(direction: -1 | 1): void {
    if (direction !== -1 && direction !== 1)
      throw new ChannelTransportError('invalidRequest', false)
    const index = mediaViewerIndex.value
    const message = index < 0 ? undefined : viewableMediaMessages.value[index + direction]
    if (message) mediaViewerRef.value = copyMessageRef(message.ref)
  }

  async function saveMedia(messageRef: MessageRef): Promise<void> {
    const client = mediaClient.value
    if (!client) throw new ChannelTransportError('unsupportedCapability', false)
    const target = mediaMessageTarget(messageRef)
    if (activeMediaSaveOperationId) await cancelActiveMediaSave(client)
    const operationId = `media-save:${randomOperationId()}`
    const generation = ++mediaSaveGeneration
    activeMediaSaveOperationId = operationId
    mediaSaveSources.set(target.key, target.sourceSignature)
    setMediaSaveState(target.key, {
      operationId,
      messageRef: target.messageRef,
      status: 'choosing',
      receivedBytes: 0,
      retryable: false,
    })
    const listener = (event: ChannelMediaSaveProgressEvent) => {
      if (!hasMediaSaveContext(client, generation, operationId)) return
      const current = mediaSavesByMessage.get(target.key)
      if (!current || current.operationId !== operationId) return
      const receivedBytes = boundedMediaBytes(event.receivedBytes)
      const totalBytes =
        event.totalBytes === undefined ? undefined : boundedMediaBytes(event.totalBytes)
      setMediaSaveState(target.key, {
        ...current,
        status: 'saving',
        receivedBytes,
        ...(totalBytes !== undefined ? { totalBytes } : {}),
        retryable: false,
      })
    }
    let operation: ReturnType<ChannelMediaClient['save']>
    try {
      operation = Promise.resolve(
        client.save({ operationId, messageRef: target.messageRef }, listener),
      )
    } catch (error) {
      operation = Promise.reject(error)
    }
    try {
      const result = await operation
      if (!hasMediaSaveContext(client, generation, operationId)) return
      const current = mediaSavesByMessage.get(target.key)
      if (!current || current.operationId !== operationId) return
      if (result.status === 'cancelled') {
        setMediaSaveState(target.key, {
          ...current,
          status: 'cancelled',
          retryable: false,
        })
      } else {
        setMediaSaveState(target.key, {
          ...current,
          status: 'saved',
          receivedBytes: result.byteLength,
          totalBytes: result.byteLength,
          fileName: result.fileName,
          byteLength: result.byteLength,
          retryable: false,
        })
      }
    } catch (error) {
      if (hasMediaSaveContext(client, generation, operationId)) {
        const current = mediaSavesByMessage.get(target.key)
        const failure = mediaSaveFailure(error)
        if (current && current.operationId === operationId)
          setMediaSaveState(target.key, {
            ...current,
            status: 'failed',
            errorCode: failure.errorCode,
            retryable: failure.retryable,
          })
      }
      throw error
    } finally {
      if (hasMediaSaveContext(client, generation, operationId)) activeMediaSaveOperationId = null
    }
  }

  async function retryMediaSave(messageRef: MessageRef): Promise<void> {
    const target = mediaMessageTarget(messageRef)
    const current = mediaSavesByMessage.get(target.key)
    if (!current || current.status !== 'failed' || !current.retryable)
      throw new ChannelTransportError('invalidRequest', false)
    await saveMedia(target.messageRef)
  }

  async function cancelMediaSave(messageRef: MessageRef): Promise<void> {
    const client = mediaClient.value
    if (!client) throw new ChannelTransportError('unsupportedCapability', false)
    const target = mediaMessageTarget(messageRef)
    const current = mediaSavesByMessage.get(target.key)
    if (
      !current ||
      current.operationId !== activeMediaSaveOperationId ||
      (current.status !== 'choosing' && current.status !== 'saving')
    )
      return
    await cancelActiveMediaSave(client)
  }

  async function cancelActiveMediaSave(client: ChannelMediaClient): Promise<void> {
    const operationId = activeMediaSaveOperationId
    if (!operationId) return
    const entry = [...mediaSavesByMessage].find(([, state]) => state.operationId === operationId)
    mediaSaveGeneration += 1
    activeMediaSaveOperationId = null
    try {
      await client.cancel(operationId)
      if (entry)
        setMediaSaveState(entry[0], {
          ...entry[1],
          status: 'cancelled',
          retryable: false,
        })
    } catch (error) {
      if (entry) {
        const failure = mediaSaveFailure(error)
        setMediaSaveState(entry[0], {
          ...entry[1],
          status: 'failed',
          errorCode: failure.errorCode,
          retryable: failure.retryable,
        })
      }
      throw error
    }
  }

  function hasMediaSaveContext(
    client: ChannelMediaClient,
    generation: number,
    operationId: string,
  ): boolean {
    return (
      mediaClient.value === client &&
      mediaSaveGeneration === generation &&
      activeMediaSaveOperationId === operationId
    )
  }

  function setMediaSaveState(key: string, state: ChannelMediaSaveState): void {
    mediaSavesByMessage.delete(key)
    mediaSavesByMessage.set(key, {
      ...state,
      messageRef: copyMessageRef(state.messageRef),
    })
    while (mediaSavesByMessage.size > MAX_MEDIA_SAVE_PROJECTIONS) {
      const oldest = mediaSavesByMessage.keys().next().value
      if (typeof oldest !== 'string') break
      mediaSavesByMessage.delete(oldest)
      mediaSaveSources.delete(oldest)
    }
  }

  function mediaMessageTarget(messageRef: MessageRef): {
    key: string
    messageRef: MessageRef
    sourceSignature: string
  } {
    const message = messageForRef(messageRef)
    if (!message || !isMediaMessage(message))
      throw new ChannelTransportError('invalidRequest', false)
    return {
      key: messageKey(message.ref),
      messageRef: copyMessageRef(message.ref),
      sourceSignature: mediaSourceSignature(message),
    }
  }

  function messageForRef(messageRef: MessageRef): Message | null {
    return (
      (projection.messagesByChannel.get(messageRef.channelRef) ?? []).find((message) =>
        sameMessage(message.ref, messageRef),
      ) ?? null
    )
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

  async function openThread(messageRef: MessageRef): Promise<void> {
    const client = requireTransport()
    if (activeChannelRef.value !== messageRef.channelRef)
      throw new ChannelTransportError('invalidRequest', false)
    if (
      !client
        .capabilities()
        .some((capability) => capability.id === 'message.thread' && capability.available)
    )
      throw new ChannelTransportError('unsupportedCapability', false)
    const root = messageForRef(messageRef)
    if (!root || root.state !== 'active') throw new ChannelTransportError('invalidRequest', false)
    if (
      threadRootRef.value &&
      sameMessage(threadRootRef.value, root.ref) &&
      (loadingThread.value || thread.value)
    )
      return

    const ref = copyMessageRef(root.ref)
    const generation = lifecycleGeneration
    const operationId = ++threadOperationId
    threadRootRef.value = ref
    thread.value = null
    loadingThread.value = true
    threadErrorCode.value = null
    try {
      const value = await client.loadThread(ref)
      if (!hasThreadContext(client, generation, operationId, ref)) return
      if (
        value.channelRef !== ref.channelRef ||
        !sameMessage(value.root.ref, ref) ||
        value.root.state !== 'active' ||
        value.replies.some((reply) => reply.ref.channelRef !== ref.channelRef) ||
        !Number.isSafeInteger(value.replyCount) ||
        value.replyCount < value.replies.length
      )
        throw new ChannelTransportError('protocolFailure', false)
      thread.value = structuredClone(value)
    } catch (error) {
      if (hasThreadContext(client, generation, operationId, ref)) {
        threadErrorCode.value = transportErrorCode(error)
        errorCode.value = threadErrorCode.value
      }
      throw error
    } finally {
      if (hasThreadContext(client, generation, operationId, ref)) loadingThread.value = false
    }
  }

  async function retryThread(): Promise<void> {
    const root = threadRootRef.value
    if (!root) return
    await openThread(root)
  }

  function closeThread(): void {
    clearThreadProjection()
  }

  async function sendThreadContent(
    content: OutgoingMessageContent,
    mentions: MessageMention[] = [],
  ): Promise<SendMessageResult | null> {
    const root = threadRootRef.value
    const channelRef = activeChannelRef.value
    if (!root || !channelRef || root.channelRef !== channelRef) return null
    const generation = lifecycleGeneration
    const client = requireTransport()
    const result = await startOutgoingContent(channelRef, content, root, mentions).completion
    if (
      result &&
      generation === lifecycleGeneration &&
      transport.value === client &&
      threadRootRef.value &&
      sameMessage(threadRootRef.value, root)
    )
      await openThread(root).catch(() => undefined)
    return result
  }

  async function sendThreadText(
    text: string,
    mentions: MessageMention[] = [],
  ): Promise<SendMessageResult | null> {
    const trimmed = text.trim()
    if (!trimmed) return null
    return sendThreadContent(createTextMessageContent(trimmed), mentions)
  }

  async function sendThreadSubmission(
    submission: Omit<ChannelComposerSubmission, 'replyTo'>,
  ): Promise<void> {
    const root = threadRootRef.value
    const channelRef = activeChannelRef.value
    if (!root || !channelRef || root.channelRef !== channelRef) return
    const deliveries = prepareChannelComposerSubmission(submission).map((delivery) => ({
      ...delivery,
      replyTo: root,
    }))
    if (!deliveries.length) return

    const generation = lifecycleGeneration
    const client = requireTransport()
    const completions = deliveries.map(
      (delivery) =>
        startOutgoingContent(channelRef, delivery.content, delivery.replyTo, delivery.mentions)
          .completion,
    )
    const results = await Promise.allSettled(completions)
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failure) throw failure.reason
    if (
      generation === lifecycleGeneration &&
      transport.value === client &&
      threadRootRef.value &&
      sameMessage(threadRootRef.value, root)
    )
      await openThread(root).catch(() => undefined)
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
    clearPresenceProjection()
    clearVoiceTranscriptProjection()
    clearVoicePlaybackProjection()
    const media = mediaClient.value
    clearMediaProjection(media)
    await flushAllDrafts()
    await clearOutgoingAttempts(attachmentPicker.value)
    lifecycleGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    const client = transport.value
    const playback = voicePlaybackClient.value
    transport.value = null
    attachmentPicker.value = null
    draftClient.value = null
    voicePlaybackClient.value = null
    mediaClient.value = null
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
    playback?.dispose()
    await Promise.all([media?.dispose(), client?.dispose()])
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
    const reactionBefore =
      event.type === 'message.reactionsChanged'
        ? (projection.messagesByChannel.get(event.ref.channelRef) ?? []).find((message) =>
            sameMessage(message.ref, event.ref),
          )
        : undefined
    const reduced = reduceChannelEvent(projection, event)
    if (event.type === 'message.reactionsChanged') {
      const reactionAfter = (projection.messagesByChannel.get(event.ref.channelRef) ?? []).find(
        (message) => sameMessage(message.ref, event.ref),
      )
      debugQuickComment('store.event', {
        ref: event.ref,
        type: event.type,
        sequence: event.sequence,
        accepted: reduced,
        projectionLastSequence: projection.lastEventSequence,
        before: reactionBefore?.reactions,
        eventReactions: event.reactions,
        after: reactionAfter?.reactions,
        matched: Boolean(reactionAfter),
      })
    }
    if (
      event.type === 'channel.deleted' &&
      activeChannelRef.value &&
      event.channelRefs.includes(activeChannelRef.value)
    )
      activeChannelRef.value = null
    reconcileMessageCursors(event)
    reconcilePinnedMessages(event)
    reconcileOutgoingAttempts(event)
    reconcilePresenceEvent(event)
    reconcileVoiceTranscripts(event)
    reconcileVoicePlayback(event)
    reconcileMedia(event)
    reconcileThread(event)
    if (event.type === 'status.changed') {
      if (event.status.phase !== 'connected') clearPresenceProjection()
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
    if (event.type === 'channel.upserted' || event.type === 'channel.deleted')
      void synchronizePresenceTargets()
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
    clearPresenceProjection()
    clearVoiceTranscriptProjection()
    clearVoicePlaybackProjection()
    clearMediaProjection()
    clearThreadProjection()
    void clearOutgoingAttempts(attachmentPicker.value)
  }

  function hasThreadContext(
    client: ChannelTransport,
    generation: number,
    operationId: number,
    root: MessageRef,
  ): boolean {
    return (
      generation === lifecycleGeneration &&
      transport.value === client &&
      threadOperationId === operationId &&
      threadRootRef.value !== null &&
      sameMessage(threadRootRef.value, root)
    )
  }

  function clearThreadProjection(): void {
    threadOperationId += 1
    threadRootRef.value = null
    thread.value = null
    loadingThread.value = false
    threadErrorCode.value = null
  }

  function reconcileThread(event: ChannelEvent): void {
    const current = thread.value
    const root = threadRootRef.value
    if (!current || !root) {
      if (event.type === 'channel.deleted' && root && event.channelRefs.includes(root.channelRef))
        clearThreadProjection()
      return
    }
    if (event.type === 'channel.deleted' && event.channelRefs.includes(root.channelRef)) {
      clearThreadProjection()
      return
    }
    if (event.type === 'message.historyCleared' && event.channelRef === root.channelRef) {
      if (event.before === undefined || current.root.sentAt <= event.before) {
        clearThreadProjection()
        return
      }
      const replies = current.replies.filter((reply) => reply.sentAt > (event.before ?? 0))
      const removedCount = current.replies.length - replies.length
      thread.value = {
        ...current,
        replies,
        replyCount: Math.max(0, current.replyCount - removedCount),
        updatedAt: Math.max(current.root.sentAt, replies.at(-1)?.sentAt ?? current.root.sentAt),
      }
      return
    }
    if (event.type === 'message.deleted') {
      if (event.refs.some((ref) => sameMessage(ref, root))) {
        clearThreadProjection()
        return
      }
      const replies = current.replies.filter(
        (reply) => !event.refs.some((ref) => sameMessage(ref, reply.ref)),
      )
      const removedCount = current.replies.length - replies.length
      if (removedCount)
        thread.value = {
          ...current,
          replies,
          replyCount: Math.max(0, current.replyCount - removedCount),
          updatedAt: Math.max(current.root.sentAt, replies.at(-1)?.sentAt ?? current.root.sentAt),
        }
      return
    }
    if (event.type === 'message.revoked') {
      if (event.refs.some((ref) => sameMessage(ref, root))) {
        clearThreadProjection()
        return
      }
      const replies = current.replies.map((reply) =>
        event.refs.some((ref) => sameMessage(ref, reply.ref))
          ? {
              ...reply,
              state: 'revoked' as const,
              text: '',
              content: { kind: 'redacted' as const, reason: 'revoked' as const },
            }
          : reply,
      )
      if (replies.some((reply, index) => reply !== current.replies[index]))
        thread.value = { ...current, replies }
      return
    }
    if (event.type !== 'message.received' && event.type !== 'message.upserted') return
    const incomingRoot = event.messages.find((message) => sameMessage(message.ref, root))
    if (incomingRoot) {
      if (incomingRoot.state !== 'active') {
        clearThreadProjection()
        return
      }
      current.root = structuredClone(incomingRoot)
    }
    const incomingReplies = event.messages.filter(
      (message) =>
        message.ref.channelRef === root.channelRef &&
        message.replyTo &&
        sameMessage(message.replyTo.ref, root),
    )
    if (!incomingReplies.length && !incomingRoot) return
    const replies = [...current.replies]
    let addedCount = 0
    for (const incoming of incomingReplies) {
      const index = replies.findIndex((reply) => sameMessage(reply.ref, incoming.ref))
      if (index >= 0) replies[index] = structuredClone(incoming)
      else {
        replies.push(structuredClone(incoming))
        addedCount += 1
      }
    }
    replies.sort(
      (left, right) =>
        left.sentAt - right.sentAt ||
        left.ref.messageClientId.localeCompare(right.ref.messageClientId),
    )
    thread.value = {
      ...current,
      root: current.root,
      replies,
      replyCount: current.replyCount + addedCount,
      updatedAt: Math.max(current.root.sentAt, replies.at(-1)?.sentAt ?? current.root.sentAt),
    }
  }

  function hasVoiceTranscriptionContext(
    client: ChannelTransport,
    generation: number,
    key: string,
    operationId: number,
  ): boolean {
    return (
      generation === lifecycleGeneration &&
      transport.value === client &&
      voiceTranscriptionOperationIds.get(key) === operationId
    )
  }

  function reconcileVoiceTranscripts(event: ChannelEvent): void {
    if (event.type === 'message.deleted' || event.type === 'message.revoked') {
      clearVoiceTranscriptsForRefs(event.refs)
      return
    }
    if (isMessageProjectionEvent(event)) {
      clearVoiceTranscriptsForRefs(
        event.messages
          .filter((message) => message.state !== 'active' || message.content.kind !== 'audio')
          .map((message) => message.ref),
      )
      return
    }
    if (event.type === 'message.historyCleared') {
      clearVoiceTranscriptsForChannels([event.channelRef])
      return
    }
    if (event.type === 'channel.deleted') clearVoiceTranscriptsForChannels(event.channelRefs)
  }

  function clearVoiceTranscriptsForRefs(refs: MessageRef[]): void {
    for (const [key, transcript] of voiceTranscriptsByMessage) {
      if (!refs.some((ref) => sameMessage(transcript.messageRef, ref))) continue
      voiceTranscriptionOperations.delete(key)
      voiceTranscriptionOperationIds.delete(key)
      voiceTranscriptsByMessage.delete(key)
    }
  }

  function clearVoiceTranscriptsForChannels(channelRefs: ChannelRef[]): void {
    const values = new Set(channelRefs)
    for (const [key, transcript] of voiceTranscriptsByMessage) {
      if (!values.has(transcript.messageRef.channelRef)) continue
      voiceTranscriptionOperations.delete(key)
      voiceTranscriptionOperationIds.delete(key)
      voiceTranscriptsByMessage.delete(key)
    }
  }

  function clearVoiceTranscriptProjection(): void {
    voiceTranscriptionOperations.clear()
    voiceTranscriptionOperationIds.clear()
    voiceTranscriptsByMessage.clear()
  }

  function reconcileVoicePlayback(event: ChannelEvent): void {
    if (event.type === 'message.deleted' || event.type === 'message.revoked') {
      clearVoicePlaybacksForRefs(event.refs)
      return
    }
    if (isMessageProjectionEvent(event)) {
      clearVoicePlaybacksForRefs(
        event.messages
          .filter((message) => {
            const key = messageKey(message.ref)
            if (!voicePlaybacksByMessage.has(key)) return false
            return (
              message.state !== 'active' ||
              message.content.kind !== 'audio' ||
              !message.content.media.url ||
              voicePlaybackSources.get(key) !== message.content.media.url.trim()
            )
          })
          .map((message) => message.ref),
      )
      return
    }
    if (event.type === 'message.historyCleared') {
      clearVoicePlaybacksForChannels([event.channelRef])
      return
    }
    if (event.type === 'channel.deleted') clearVoicePlaybacksForChannels(event.channelRefs)
  }

  function clearVoicePlaybacksForRefs(refs: MessageRef[]): void {
    const keys = [...voicePlaybacksByMessage]
      .filter(([, playback]) => refs.some((ref) => sameMessage(playback.messageRef, ref)))
      .map(([key]) => key)
    clearVoicePlaybackKeys(keys)
  }

  function clearVoicePlaybacksForChannels(channelRefs: ChannelRef[]): void {
    const values = new Set(channelRefs)
    const keys = [...voicePlaybacksByMessage]
      .filter(([, playback]) => values.has(playback.messageRef.channelRef))
      .map(([key]) => key)
    clearVoicePlaybackKeys(keys)
  }

  function clearVoicePlaybackKeys(keys: string[]): void {
    if (!keys.length) return
    const values = new Set(keys)
    if (activeVoicePlaybackKey && values.has(activeVoicePlaybackKey)) {
      voicePlaybackGeneration += 1
      voicePlaybackClient.value?.stop()
      activeVoicePlaybackKey = null
    }
    for (const key of values) {
      voicePlaybacksByMessage.delete(key)
      voicePlaybackSources.delete(key)
    }
  }

  function clearVoicePlaybackProjection(): void {
    voicePlaybackGeneration += 1
    if (activeVoicePlaybackKey) voicePlaybackClient.value?.stop()
    activeVoicePlaybackKey = null
    voicePlaybacksByMessage.clear()
    voicePlaybackSources.clear()
    voicePlaybackRate.value = 1
  }

  function reconcileMedia(event: ChannelEvent): void {
    if (event.type === 'message.deleted' || event.type === 'message.revoked') {
      clearMediaForRefs(event.refs)
      return
    }
    if (isMessageProjectionEvent(event)) {
      clearMediaForRefs(
        event.messages
          .filter((message) => {
            const key = messageKey(message.ref)
            const source = mediaSaveSources.get(key)
            return Boolean(
              source && (!isMediaMessage(message) || source !== mediaSourceSignature(message)),
            )
          })
          .map((message) => message.ref),
      )
      const viewer = mediaViewerRef.value
      const replacement = viewer
        ? event.messages.find((message) => sameMessage(message.ref, viewer))
        : undefined
      if (replacement && !isViewableMediaMessage(replacement)) closeMediaViewer()
      return
    }
    if (event.type === 'message.historyCleared') {
      clearMediaForChannels([event.channelRef])
      return
    }
    if (event.type === 'channel.deleted') clearMediaForChannels(event.channelRefs)
  }

  function clearMediaForRefs(refs: MessageRef[]): void {
    const keys = [...mediaSavesByMessage]
      .filter(([, state]) => refs.some((ref) => sameMessage(state.messageRef, ref)))
      .map(([key]) => key)
    const viewer = mediaViewerRef.value
    if (viewer && refs.some((ref) => sameMessage(viewer, ref))) closeMediaViewer()
    clearMediaKeys(keys)
  }

  function clearMediaForChannels(channelRefs: ChannelRef[]): void {
    const values = new Set(channelRefs)
    const keys = [...mediaSavesByMessage]
      .filter(([, state]) => values.has(state.messageRef.channelRef))
      .map(([key]) => key)
    if (mediaViewerRef.value && values.has(mediaViewerRef.value.channelRef)) closeMediaViewer()
    clearMediaKeys(keys)
  }

  function clearMediaKeys(keys: string[]): void {
    if (!keys.length) return
    const values = new Set(keys)
    const active = activeMediaSaveOperationId
      ? [...mediaSavesByMessage].find(
          ([key, state]) => values.has(key) && state.operationId === activeMediaSaveOperationId,
        )
      : undefined
    if (active) {
      const operationId = active[1].operationId
      mediaSaveGeneration += 1
      activeMediaSaveOperationId = null
      void mediaClient.value?.cancel(operationId).catch(() => undefined)
    }
    for (const key of values) {
      mediaSavesByMessage.delete(key)
      mediaSaveSources.delete(key)
    }
  }

  function clearMediaProjection(client: ChannelMediaClient | null = mediaClient.value): void {
    mediaSaveGeneration += 1
    const operationId = activeMediaSaveOperationId
    activeMediaSaveOperationId = null
    if (operationId) void client?.cancel(operationId).catch(() => undefined)
    mediaSavesByMessage.clear()
    mediaSaveSources.clear()
    closeMediaViewer()
  }

  function desiredPresenceAccountIds(): string[] {
    return [
      ...new Set(
        [...projection.channels.values()]
          .filter((channel) => channel.kind === 'direct')
          .map((channel) => channel.directAccountId?.trim())
          .filter((accountId): accountId is string => Boolean(accountId)),
      ),
    ].sort((left, right) => left.localeCompare(right))
  }

  function synchronizePresenceTargets(): Promise<void> {
    const client = transport.value
    if (
      !client ||
      status.value.phase !== 'connected' ||
      !channelCatalogReady.value ||
      !client
        .capabilities()
        .some((capability) => capability.id === 'presence.subscribe' && capability.available)
    ) {
      return Promise.resolve()
    }
    const accountIds = desiredPresenceAccountIds()
    const key = `${status.value.accountRef ?? ''}\0${accountIds.join('\0')}`
    if (presenceTargetKey === key) return presenceSynchronization
    presenceTargetKey = key
    const lifecycle = lifecycleGeneration
    const generation = presenceGeneration
    const operation = presenceSynchronization
      .catch(() => undefined)
      .then(async () => {
        if (!hasPresenceContext(client, lifecycle, generation) || presenceTargetKey !== key) return
        try {
          await client.setPresenceSubscriptions([...accountIds])
          if (hasPresenceContext(client, lifecycle, generation) && presenceTargetKey === key)
            presenceErrorCode.value = null
        } catch (error) {
          if (hasPresenceContext(client, lifecycle, generation) && presenceTargetKey === key) {
            presenceTargetKey = null
            presenceErrorCode.value = transportErrorCode(error)
          }
        }
      })
    presenceSynchronization = operation
    return operation
  }

  function hasPresenceContext(
    client: ChannelTransport,
    lifecycle: number,
    generation: number,
  ): boolean {
    return (
      transport.value === client &&
      lifecycleGeneration === lifecycle &&
      presenceGeneration === generation &&
      status.value.phase === 'connected'
    )
  }

  function reconcilePresenceEvent(event: ChannelEvent): void {
    if (event.type === 'presence.subscriptionFailed') {
      if (status.value.phase === 'connected') {
        presenceTargetKey = null
        presenceErrorCode.value = event.errorCode
      }
      return
    }
    if (event.type !== 'presence.changed' || status.value.phase !== 'connected') return
    const desired = new Set(desiredPresenceAccountIds())
    for (const presence of event.presences) {
      if (!desired.has(presence.accountId)) continue
      const current = presenceByAccount.get(presence.accountId)
      if (current && presence.updatedAt <= current.updatedAt) continue
      presenceByAccount.set(presence.accountId, structuredClone(presence))
    }
  }

  function clearPresenceProjection(): void {
    presenceGeneration += 1
    presenceTargetKey = null
    presenceSynchronization = Promise.resolve()
    presenceByAccount.clear()
    presenceErrorCode.value = null
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
    if (isMessageProjectionEvent(event)) {
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
      void synchronizePresenceTargets()
    } catch (error) {
      if (generation === lifecycleGeneration) errorCode.value = transportErrorCode(error)
      throw error
    } finally {
      if (generation === lifecycleGeneration) mutatingChannelRefs.delete(channelRef)
    }
  }

  async function markSelectedChannelRead(
    client: ChannelTransport,
    channelRef: ChannelRef,
    generation: number,
    operationId: number,
  ): Promise<void> {
    try {
      await client.markRead(channelRef)
      if (generation !== lifecycleGeneration || transport.value !== client) return
      const channel = projection.channels.get(channelRef)
      if (channel) projection.channels.set(channelRef, { ...channel, unreadCount: 0 })
    } catch (error) {
      if (
        generation === lifecycleGeneration &&
        operationId === channelSelectionOperationId &&
        transport.value === client &&
        projection.channels.has(channelRef)
      )
        errorCode.value = transportErrorCode(error)
    }
  }

  return {
    channels,
    presences,
    activeChannelRef,
    highlightedMessageKey,
    activeChannel,
    activePresence,
    activeMessages,
    activeVoiceTranscripts,
    activeVoicePlaybacks,
    voicePlaybackRate,
    voicePlaybackAvailable,
    activeMediaSaves,
    mediaSavingAvailable,
    mediaViewerMessage,
    mediaViewerCanGoPrevious,
    mediaViewerCanGoNext,
    activeOutgoingAttempts,
    activeThreadOutgoingAttempts,
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
    threadRootRef,
    thread,
    loadingThread,
    threadErrorCode,
    errorCode,
    presenceErrorCode,
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
    transcribeVoice,
    toggleVoicePlayback,
    retryVoicePlayback,
    pauseVoicePlayback,
    seekVoicePlayback,
    setVoicePlaybackRate,
    openMediaViewer,
    closeMediaViewer,
    navigateMediaViewer,
    saveMedia,
    retryMediaSave,
    cancelMediaSave,
    getMessageReceiptDetails,
    openThread,
    retryThread,
    closeThread,
    sendThreadContent,
    sendThreadText,
    sendThreadSubmission,
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

function isMessageProjectionEvent(
  event: ChannelEvent,
): event is Extract<ChannelEvent, { type: 'message.received' | 'message.upserted' }> {
  return event.type === 'message.received' || event.type === 'message.upserted'
}

function transportErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'transport'
}

function copyMessageRef(ref: MessageRef): MessageRef {
  return {
    channelRef: ref.channelRef,
    messageClientId: ref.messageClientId,
    ...(ref.messageServerId ? { messageServerId: ref.messageServerId } : {}),
  }
}

function transportErrorRetryable(error: unknown): boolean {
  return error instanceof ChannelTransportError ||
    (typeof error === 'object' && error !== null && 'retryable' in error)
    ? Boolean(error.retryable)
    : true
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
    ref: copyMessageRef(ref),
    senderName: message?.sender.name ?? '',
    text: message?.text ?? '',
  }
}

function outgoingAttemptFailure(error: unknown): { errorCode: string; retryable: boolean } {
  return {
    errorCode: transportErrorCode(error),
    retryable: transportErrorRetryable(error),
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

type MediaMessage = Message & {
  content: Extract<Message['content'], { kind: 'image' | 'audio' | 'video' | 'file' }>
}

type ViewableMediaMessage = Message & {
  content: Extract<Message['content'], { kind: 'image' | 'video' }>
}

function isMediaMessage(message: Message): message is MediaMessage {
  return (
    message.state === 'active' &&
    (message.content.kind === 'image' ||
      message.content.kind === 'audio' ||
      message.content.kind === 'video' ||
      message.content.kind === 'file')
  )
}

function isViewableMediaMessage(message: Message): message is ViewableMediaMessage {
  return (
    message.state === 'active' &&
    (message.content.kind === 'image' || message.content.kind === 'video') &&
    Boolean(message.content.media.url?.trim())
  )
}

function mediaSourceSignature(message: MediaMessage): string {
  return JSON.stringify([
    message.content.kind,
    message.content.media.url?.trim() ?? '',
    message.content.media.name?.trim() ?? '',
    message.content.media.size ?? null,
    message.content.media.extension?.trim() ?? '',
  ])
}

function boundedMediaBytes(value: number): number {
  return Number.isSafeInteger(value) ? Math.max(0, value) : 0
}

function mediaSaveFailure(error: unknown): {
  errorCode: ChannelMediaSaveErrorCode
  retryable: boolean
} {
  if (error instanceof ChannelMediaClientError)
    return { errorCode: error.code, retryable: error.retryable }
  const candidate =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown'
  return {
    errorCode: mediaSaveErrorCode(candidate),
    retryable:
      typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean(error.retryable)
        : true,
  }
}

function mediaSaveErrorCode(value: string): ChannelMediaSaveErrorCode {
  if (
    value === 'invalidRequest' ||
    value === 'messageUnavailable' ||
    value === 'mediaUnavailable' ||
    value === 'unsupportedProtocol' ||
    value === 'tooLarge' ||
    value === 'downloadFailed' ||
    value === 'writeFailed'
  )
    return value
  return 'unknown'
}

function boundedVoiceMilliseconds(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_VOICE_DURATION_MS, Math.max(0, Math.round(value)))
    : 0
}

function clampMilliseconds(positionMs: number, durationMs: number): number {
  const maximum = boundedVoiceMilliseconds(durationMs) || MAX_VOICE_DURATION_MS
  return Math.min(maximum, boundedVoiceMilliseconds(positionMs))
}

function voicePlaybackFailure(error: unknown): {
  errorCode: ChannelVoicePlaybackErrorCode
  retryable: boolean
} {
  if (error instanceof ChannelVoicePlaybackClientError)
    return { errorCode: error.code, retryable: error.retryable }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? voicePlaybackErrorCode(String(error.code))
      : 'unknown'
  return {
    errorCode: code,
    retryable:
      typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean(error.retryable)
        : true,
  }
}

function voicePlaybackErrorCode(value: string): ChannelVoicePlaybackErrorCode {
  if (value === 'blocked' || value === 'network' || value === 'decode' || value === 'unsupported')
    return value
  return 'unknown'
}
