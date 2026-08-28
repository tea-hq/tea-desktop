import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type {
  ApprovalDecision,
  ConversationClient,
  ComposerAttachment,
  ConversationEvent,
  ConversationSummary,
  ConversationScopeFilter,
  ConversationTurn,
  ConversationUiError,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from './contracts'
import {
  cancelConversationTurn,
  completeApproval,
  createConversationTurn,
  failConversationTurn,
  findApproval,
  reduceConversationTurn,
  setApprovalFailed,
  setApprovalResolving,
} from './timelineReducer'
import { runtimeModelOptions } from './modelOptions'

const DEFAULT_RUNTIME_ID = 'external.claude'
const PAGE_LIMIT = 30
const HISTORY_PAGE_LIMIT = 50

export const useConversationStore = defineStore('conversation', () => {
  const runtimes = shallowRef<RuntimeDescriptor[]>([])
  const conversations = ref<ConversationSummary[]>([])
  const catalogFilter = ref<ConversationScopeFilter>({ kind: 'all' })
  const defaultRuntimeId = ref(DEFAULT_RUNTIME_ID)
  const activeRuntimeId = ref<string | null>(null)
  const selectedModel = ref('default')
  const permissionMode = ref<PermissionMode>('default')
  const conversationId = ref<string | null>(null)
  const turns = ref<ConversationTurn[]>([])
  const loading = ref(false)
  const error = ref<ConversationUiError | null>(null)

  const listLoading = ref(false)
  const listLoadingMore = ref(false)
  const listError = ref<ConversationUiError | null>(null)
  const historyLoading = ref(false)
  const historyLoadingMore = ref(false)
  const historyError = ref<ConversationUiError | null>(null)
  const historyPageError = ref<ConversationUiError | null>(null)
  const historyNextCursor = ref<string | null>(null)
  const historyHasMore = ref(false)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)

  let client: ConversationClient | null = null
  let unsubscribe: (() => void) | null = null
  let unsubscribeUpdates: (() => void) | null = null
  let listInitialized = false
  let selectionToken = 0
  let lifecycleGeneration = 0
  let creationIdempotencyKey = crypto.randomUUID()

  const activeRuntime = computed(() =>
    runtimes.value.find(runtime => runtime.id === activeRuntimeId.value) ?? null,
  )
  const activeConversation = computed(() =>
    conversations.value.find(item => item.conversationId === conversationId.value) ?? null,
  )
  const isStreaming = computed(() => {
    const status = turns.value.at(-1)?.status
    return status === 'sending' || status === 'running'
  })
  const canSend = computed(() =>
    conversationId.value !== null && !isStreaming.value && !loading.value && !historyLoading.value,
  )
  const canSelectRuntime = computed(() =>
    conversationId.value === null && !loading.value && !historyLoading.value,
  )
  const hasConversations = computed(() => conversations.value.length > 0)
  const modelOptions = computed<ModelOption[]>(() => runtimeModelOptions(activeRuntime.value))

  function localizedError(key: string): ConversationUiError {
    return { kind: 'localized', key }
  }

  function runtimeError(value: unknown): ConversationUiError {
    const candidate = value as { message?: unknown } | null
    const message = candidate && typeof candidate.message === 'string'
      ? candidate.message
      : value instanceof Error ? value.message : String(value)
    return { kind: 'runtime', message }
  }

  function configure(nextClient: ConversationClient): void {
    lifecycleGeneration += 1
    const generation = lifecycleGeneration
    client = nextClient
    unsubscribeUpdates?.()
    unsubscribeUpdates = client.subscribeToConversationUpdates(summary => {
      if (generation === lifecycleGeneration && client === nextClient) mergeSummary(summary)
    })
  }

  async function loadRuntimes(): Promise<void> {
    const configured = client
    if (!configured) {
      error.value = localizedError('errors.clientNotConfigured')
      return
    }
    const generation = lifecycleGeneration
    loading.value = true
    error.value = null
    try {
      const values = await configured.listRuntimes()
      if (generation !== lifecycleGeneration || client !== configured) return
      runtimes.value = values
      if (activeRuntimeId.value === null && runtimes.value.length > 0) {
        activeRuntimeId.value = resolveNewConversationRuntime()
      }
    } catch {
      error.value = localizedError('errors.runtimeListFailed')
    } finally {
      if (generation === lifecycleGeneration) loading.value = false
    }
  }

  async function initializeConversationList(force = false): Promise<void> {
    const configured = client
    if (!configured || listLoading.value || (!force && listInitialized)) return
    const generation = lifecycleGeneration
    listLoading.value = true
    listError.value = null
    try {
      const page = await configured.listConversations({ limit: PAGE_LIMIT, filter: catalogFilter.value })
      if (generation !== lifecycleGeneration || client !== configured) return
      conversations.value = uniqueSorted(page.items)
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
      listInitialized = true
    } catch {
      if (generation === lifecycleGeneration) listError.value = localizedError('sidebar.listFailed')
    } finally {
      if (generation === lifecycleGeneration) listLoading.value = false
    }
  }

  async function loadMoreConversations(): Promise<void> {
    const configured = client
    if (!configured || listLoading.value || listLoadingMore.value || !hasMore.value || !nextCursor.value) {
      return
    }
    const generation = lifecycleGeneration
    listLoadingMore.value = true
    listError.value = null
    const cursor = nextCursor.value
    try {
      const page = await configured.listConversations({ cursor, limit: PAGE_LIMIT, filter: catalogFilter.value })
      if (generation !== lifecycleGeneration || client !== configured) return
      conversations.value = uniqueSorted([...conversations.value, ...page.items])
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (cause) {
      if (generation === lifecycleGeneration) listError.value = runtimeError(cause)
    } finally {
      if (generation === lifecycleGeneration) listLoadingMore.value = false
    }
  }

  function selectRuntime(id: string): void {
    if (!canSelectRuntime.value || id === activeRuntimeId.value) return
    activeRuntimeId.value = id
    selectedModel.value = 'default'
    cleanupSubscription()
    conversationId.value = null
    turns.value = []
  }

  function setDefaultRuntimeId(id: string): void {
    defaultRuntimeId.value = id
  }

  async function setCatalogFilter(filter: ConversationScopeFilter): Promise<void> {
    if (filter.kind === catalogFilter.value.kind) return
    catalogFilter.value = filter
    listInitialized = false
    nextCursor.value = null
    hasMore.value = false
    await initializeConversationList(true)
  }

  function startNewConversation(): void {
    selectionToken++
    cleanupSubscription()
    conversationId.value = null
    turns.value = []
    error.value = null
    historyError.value = null
    historyPageError.value = null
    historyNextCursor.value = null
    historyHasMore.value = false
    activeRuntimeId.value = resolveNewConversationRuntime()
    selectedModel.value = 'default'
    permissionMode.value = 'default'
    creationIdempotencyKey = crypto.randomUUID()
  }

  async function selectConversation(id: string): Promise<void> {
    if (id === conversationId.value) return
    const configured = client
    if (!configured) {
      historyError.value = localizedError('errors.clientNotConfigured')
      return
    }
    const generation = lifecycleGeneration
    const summary = conversations.value.find(item => item.conversationId === id)
    if (!summary) return

    const token = ++selectionToken
    cleanupSubscription()
    const bufferedEvents: ConversationEvent[] = []
    let snapshotReady = false
    const selectedSubscription = await configured.subscribeToEvents(id, event => {
      if (token !== selectionToken) return
      if (!snapshotReady) bufferedEvents.push(event)
      else handleEvent(event)
    })
    if (token !== selectionToken
      || generation !== lifecycleGeneration
      || client !== configured) {
      selectedSubscription()
      return
    }
    unsubscribe = selectedSubscription
    historyLoading.value = true
    historyError.value = null
    try {
      const [detail, page] = await Promise.all([
        configured.getConversation(id),
        configured.loadConversationHistory({ conversationId: id, limit: HISTORY_PAGE_LIMIT }),
      ])
      if (token !== selectionToken
        || generation !== lifecycleGeneration
        || client !== configured) return
      conversationId.value = id
      activeRuntimeId.value = detail.summary.runtimeId
      selectedModel.value = 'default'
      permissionMode.value = 'default'
      turns.value = structuredClone(page.items)
      historyNextCursor.value = page.nextCursor
      historyHasMore.value = page.hasMore
      mergeSummary(detail.summary)
      snapshotReady = true
      for (const event of bufferedEvents) handleEvent(event)
    } catch (cause) {
      if (token !== selectionToken) return
      conversationId.value = id
      activeRuntimeId.value = summary.runtimeId
      historyError.value = runtimeError(cause)
      snapshotReady = true
      for (const event of bufferedEvents) handleEvent(event)
    } finally {
      if (token === selectionToken) historyLoading.value = false
    }
  }

  async function loadOlderHistory(): Promise<void> {
    const configured = client
    const currentId = conversationId.value
    const cursor = historyNextCursor.value
    if (!configured || !currentId || !cursor || !historyHasMore.value || historyLoadingMore.value) return
    const generation = lifecycleGeneration
    const token = selectionToken
    historyLoadingMore.value = true
    historyPageError.value = null
    try {
      const page = await configured.loadConversationHistory({
        conversationId: currentId,
        cursor,
        limit: HISTORY_PAGE_LIMIT,
      })
      if (generation !== lifecycleGeneration
        || client !== configured
        || token !== selectionToken
        || conversationId.value !== currentId) return
      turns.value = mergeHistoryTurns(turns.value, page.items)
      historyNextCursor.value = page.nextCursor
      historyHasMore.value = page.hasMore
    } catch (cause) {
      if (generation === lifecycleGeneration && token === selectionToken) {
        historyPageError.value = runtimeError(cause)
      }
    } finally {
      if (generation === lifecycleGeneration && token === selectionToken) historyLoadingMore.value = false
    }
  }

  async function createConversation(): Promise<void> {
    const configured = client
    if (!configured || !activeRuntimeId.value) {
      error.value = localizedError('errors.noRuntimeSelected')
      return
    }
    const generation = lifecycleGeneration
    loading.value = true
    error.value = null
    try {
      const result = await configured.createConversation(activeRuntimeId.value, {
        idempotencyKey: creationIdempotencyKey,
      })
      if (generation !== lifecycleGeneration || client !== configured) return
      selectionToken++
      cleanupSubscription()
      conversationId.value = result.handle.conversationId
      turns.value = []
      historyNextCursor.value = null
      historyHasMore.value = false
      const subscription = await configured.subscribeToEvents(result.handle.conversationId, handleEvent)
      if (generation !== lifecycleGeneration || client !== configured) {
        subscription()
        return
      }
      unsubscribe = subscription
      if (result.summary) {
        mergeSummary(result.summary)
      }
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
    } finally {
      if (generation === lifecycleGeneration) loading.value = false
    }
  }

  async function sendMessage(text: string, attachments: ComposerAttachment[] = []): Promise<void> {
    const configured = client
    if (configured && !conversationId.value) await createConversation()
    const currentId = conversationId.value
    if (!configured || !currentId) {
      error.value = localizedError('errors.noActiveConversation')
      return
    }
    const generation = lifecycleGeneration
    const turnId = crypto.randomUUID()
    const turn = createConversationTurn(
      turnId,
      crypto.randomUUID(),
      text,
      attachments.map(attachment => attachment.name),
      0,
    )
    turns.value = [...turns.value, turn]
    error.value = null
    try {
      await configured.sendMessage(currentId, text, {
        model: selectedModel.value,
        permissionMode: permissionMode.value,
      })
    } catch (cause) {
      if (generation !== lifecycleGeneration || client !== configured) return
      const message = cause instanceof Error ? cause.message : String(cause)
      updateTurn(turnId, current => failConversationTurn(current, {
        code: 'internal', message, retryable: false,
      }))
      error.value = runtimeError(cause)
    }
  }

  async function cancelConversation(): Promise<void> {
    const configured = client
    const currentId = conversationId.value
    if (!configured || !currentId) return
    const generation = lifecycleGeneration
    try {
      await configured.cancelConversation(currentId)
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return
    }
    if (generation !== lifecycleGeneration || client !== configured) return
    const turn = turns.value.at(-1)
    if (turn) updateTurn(turn.id, cancelConversationTurn)
  }

  async function dispose(): Promise<void> {
    lifecycleGeneration += 1
    selectionToken += 1
    const configured = client
    const activeConversationId = conversationId.value
    const shouldCancel = isStreaming.value
    cleanupSubscription()
    unsubscribeUpdates?.()
    unsubscribeUpdates = null
    client = null
    runtimes.value = []
    conversations.value = []
    catalogFilter.value = { kind: 'all' }
    activeRuntimeId.value = null
    selectedModel.value = 'default'
    permissionMode.value = 'default'
    conversationId.value = null
    turns.value = []
    loading.value = false
    error.value = null
    listLoading.value = false
    listLoadingMore.value = false
    listError.value = null
    historyLoading.value = false
    historyLoadingMore.value = false
    historyError.value = null
    historyPageError.value = null
    historyNextCursor.value = null
    historyHasMore.value = false
    nextCursor.value = null
    hasMore.value = false
    listInitialized = false
    creationIdempotencyKey = crypto.randomUUID()
    if (configured && activeConversationId && shouldCancel) {
      await configured.cancelConversation(activeConversationId).catch(() => undefined)
    }
  }

  async function respondToApproval(approvalId: string, decision: ApprovalDecision): Promise<void> {
    const configured = client
    const currentId = conversationId.value
    if (!configured || !currentId) return
    const generation = lifecycleGeneration
    const turn = [...turns.value].reverse().find(candidate => findApproval(candidate, approvalId))
    const request = turn ? findApproval(turn, approvalId) : undefined
    if (!turn || !request || (request.status !== 'pending' && request.status !== 'failed')) return
    updateTurn(turn.id, current => setApprovalResolving(current, approvalId, decision))
    try {
      await configured.respondToApproval(currentId, approvalId, decision)
      if (generation !== lifecycleGeneration || client !== configured) return
      updateTurn(turn.id, current => completeApproval(current, approvalId, decision))
    } catch (cause) {
      if (generation === lifecycleGeneration) {
        updateTurn(turn.id, current => setApprovalFailed(
          current, approvalId, cause instanceof Error ? cause.message : String(cause),
        ))
      }
    }
  }

  async function renameConversation(id: string, title: string): Promise<void> {
    const configured = client
    if (!configured) return
    const generation = lifecycleGeneration
    try {
      await configured.renameConversation(id, title)
    } catch (cause) {
      if (generation === lifecycleGeneration) listError.value = runtimeError(cause)
    }
  }

  async function archiveConversation(id: string): Promise<void> {
    const configured = client
    if (!configured) return
    const generation = lifecycleGeneration
    try {
      await configured.archiveConversation(id)
      if (generation !== lifecycleGeneration || client !== configured) return
      conversations.value = conversations.value.filter(item => item.conversationId !== id)
      if (conversationId.value === id) startNewConversation()
    } catch (cause) {
      if (generation === lifecycleGeneration) listError.value = runtimeError(cause)
    }
  }

  async function deleteConversation(id: string): Promise<void> {
    const configured = client
    if (!configured) return
    const generation = lifecycleGeneration
    try {
      await configured.deleteConversation(id)
      if (generation !== lifecycleGeneration || client !== configured) return
      conversations.value = conversations.value.filter(item => item.conversationId !== id)
      if (conversationId.value === id) startNewConversation()
    } catch (cause) {
      if (generation === lifecycleGeneration) listError.value = runtimeError(cause)
    }
  }

  function handleEvent(event: ConversationEvent): void {
    if (event.conversationId !== conversationId.value) return
    const turn = turns.value.at(-1)
    if (!turn || (turn.status !== 'sending' && turn.status !== 'running')) return
    updateTurn(turn.id, current => reduceConversationTurn(current, event))
  }

  function mergeSummary(summary: ConversationSummary): void {
    const withoutCurrent = conversations.value.filter(
      item => item.conversationId !== summary.conversationId,
    )
    conversations.value = summary.archivedAt || !matchesFilter(summary, catalogFilter.value)
      ? withoutCurrent
      : uniqueSorted([summary, ...withoutCurrent])
  }

  function updateTurn(turnId: string, update: (turn: ConversationTurn) => ConversationTurn): void {
    turns.value = turns.value.map(turn => turn.id === turnId ? update(turn) : turn)
  }

  function cleanupSubscription(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  function resolveNewConversationRuntime(): string | null {
    const preferred = runtimes.value.find(
      runtime => runtime.id === defaultRuntimeId.value && runtime.status === 'ready',
    )
    return (preferred ?? runtimes.value.find(runtime => runtime.status === 'ready'))?.id ?? null
  }

  return {
    runtimes,
    conversations,
    catalogFilter,
    defaultRuntimeId,
    activeRuntime,
    activeConversation,
    activeRuntimeId,
    selectedModel,
    permissionMode,
    modelOptions,
    conversationId,
    turns,
    loading,
    error,
    listLoading,
    listLoadingMore,
    listError,
    historyLoading,
    historyLoadingMore,
    historyError,
    historyPageError,
    historyNextCursor,
    historyHasMore,
    nextCursor,
    hasMore,
    isStreaming,
    canSend,
    canSelectRuntime,
    hasConversations,
    configure,
    loadRuntimes,
    initializeConversationList,
    loadMoreConversations,
    selectRuntime,
    setDefaultRuntimeId,
    setCatalogFilter,
    startNewConversation,
    selectConversation,
    loadOlderHistory,
    createConversation,
    sendMessage,
    cancelConversation,
    dispose,
    respondToApproval,
    renameConversation,
    archiveConversation,
    deleteConversation,
  }
})

function matchesFilter(summary: ConversationSummary, filter: ConversationScopeFilter): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'local') return !summary.channelBinding
  if (filter.kind === 'channel') return Boolean(summary.channelBinding)
  const binding = summary.channelBinding
  return binding?.transportId === filter.binding.transportId
    && binding.accountRef === filter.binding.accountRef
    && binding.channelRef === filter.binding.channelRef
}

function uniqueSorted(items: ConversationSummary[]): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>()
  for (const item of items) byId.set(item.conversationId, item)
  return [...byId.values()].sort((left, right) =>
    right.updatedAt - left.updatedAt || right.conversationId.localeCompare(left.conversationId),
  )
}

export function mergeHistoryTurns(
  current: ConversationTurn[],
  older: ConversationTurn[],
): ConversationTurn[] {
  const currentIds = new Set(current.map(turn => turn.id))
  return [
    ...structuredClone(older.filter(turn => !currentIds.has(turn.id))),
    ...current,
  ]
}
