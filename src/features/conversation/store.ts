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
import type {
  CloudRunnerTag,
  RunnerRegistrationCommand,
  RunnerRegistrationCommandInput,
  RunnerTokenView,
} from '../../../packages/runner/src/protocol'
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
import { resolveModelSelection, runtimeModelOptions } from './modelOptions'
import { readyRuntimeId, resolvePreferredRuntimeId } from './runtimeSelection'

const DEFAULT_RUNTIME_ID = 'external.claude'
const PAGE_LIMIT = 30
const HISTORY_PAGE_LIMIT = 50

export const useConversationStore = defineStore('conversation', () => {
  const runtimes = shallowRef<RuntimeDescriptor[]>([])
  const conversations = ref<ConversationSummary[]>([])
  const catalogFilter = ref<ConversationScopeFilter>({ kind: 'all' })
  const defaultRuntimeId = ref(DEFAULT_RUNTIME_ID)
  const defaultModel = ref<string | null>(null)
  const activeRuntimeId = ref<string | null>(null)
  const selectedModel = ref('default')
  const workingDirectory = ref<string | null>(null)
  const executionTarget = ref<'local' | 'cloud'>('local')
  const runnerTags = ref<string[]>([])
  const cloudRunnerTags = ref<CloudRunnerTag[]>([])
  const cloudRunnerTokens = ref<RunnerTokenView[]>([])
  const cloudRunnerRegistrationCommand = ref<RunnerRegistrationCommand | null>(null)
  const cloudRunnerTokensLoading = ref(false)
  const cloudRunnerTokensError = ref<string | null>(null)
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
  const availableModelOptions = ref<ModelOption[]>([])
  const runningConversationIds = ref<Set<string>>(new Set())
  const completedConversationIds = ref<Set<string>>(new Set())

  let client: ConversationClient | null = null
  let unsubscribe: (() => void) | null = null
  let unsubscribeUpdates: (() => void) | null = null
  let unsubscribeAllEvents: (() => void) | null = null
  let listInitialized = false
  let selectionToken = 0
  let lifecycleGeneration = 0
  let creationIdempotencyKey = crypto.randomUUID()

  const activeRuntime = computed(
    () => runtimes.value.find((runtime) => runtime.id === activeRuntimeId.value) ?? null,
  )
  const activeConversation = computed(
    () => conversations.value.find((item) => item.conversationId === conversationId.value) ?? null,
  )
  const isStreaming = computed(() => {
    const status = turns.value.at(-1)?.status
    return status === 'sending' || status === 'running'
  })
  const canSend = computed(
    () =>
      conversationId.value !== null &&
      !isStreaming.value &&
      !loading.value &&
      !historyLoading.value,
  )
  const canSelectRuntime = computed(
    () => conversationId.value === null && !loading.value && !historyLoading.value,
  )
  const hasConversations = computed(() => conversations.value.length > 0)
  const modelOptions = computed<ModelOption[]>(() => runtimeModelOptions(activeRuntime.value))

  function localizedError(key: string): ConversationUiError {
    return { kind: 'localized', key }
  }

  function runtimeError(value: unknown): ConversationUiError {
    const candidate = value as { message?: unknown; code?: unknown; retryable?: unknown } | null
    const message =
      candidate && typeof candidate.message === 'string'
        ? candidate.message
        : value instanceof Error
          ? value.message
          : String(value)
    return {
      kind: 'runtime',
      message,
      code: candidate && typeof candidate.code === 'string' ? candidate.code : 'runtimeFailure',
      retryable: candidate?.retryable === true,
    }
  }

  function configure(nextClient: ConversationClient): void {
    lifecycleGeneration += 1
    const generation = lifecycleGeneration
    client = nextClient
    runningConversationIds.value = new Set()
    completedConversationIds.value = new Set()
    unsubscribeUpdates?.()
    unsubscribeAllEvents?.()
    unsubscribeAllEvents = nextClient.subscribeToAllEvents((event) => {
      if (generation === lifecycleGeneration && client === nextClient) {
        trackConversationActivity(event)
      }
    })
    unsubscribeUpdates = client.subscribeToConversationUpdates((summary) => {
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
      if (
        conversationId.value === null &&
        !readyRuntimeId(runtimes.value, activeRuntimeId.value) &&
        runtimes.value.length > 0
      ) {
        activeRuntimeId.value = resolveNewConversationRuntime()
      }
      void loadRunnerTags()
    } catch {
      error.value = localizedError('errors.runtimeListFailed')
    } finally {
      if (generation === lifecycleGeneration) loading.value = false
    }
  }

  async function loadRunnerTags(): Promise<void> {
    const configured = client
    if (!configured?.listRunnerTags) {
      cloudRunnerTags.value = []
      return
    }
    try {
      cloudRunnerTags.value = await configured.listRunnerTags()
      if (runnerTags.value.length === 0 && cloudRunnerTags.value.length > 0) {
        runnerTags.value = [cloudRunnerTags.value[0]!.tag]
      }
    } catch {
      cloudRunnerTags.value = []
    }
  }

  async function loadRunnerTokens(): Promise<void> {
    const configured = client
    if (!configured?.listRunnerTokens) {
      cloudRunnerTokens.value = []
      cloudRunnerRegistrationCommand.value = null
      return
    }
    cloudRunnerTokensLoading.value = true
    cloudRunnerTokensError.value = null
    cloudRunnerRegistrationCommand.value = null
    try {
      const tokens = await configured.listRunnerTokens()
      cloudRunnerTokens.value = tokens
      if (
        tokens.some((token) => !token.revokedAt && token.secret) &&
        configured.createRunnerRegistrationCommand
      ) {
        cloudRunnerRegistrationCommand.value = await configured.createRunnerRegistrationCommand()
      }
    } catch (cause) {
      cloudRunnerTokensError.value = runtimeMessage(cause)
    } finally {
      cloudRunnerTokensLoading.value = false
    }
  }

  async function resetPersonalRunnerToken(): Promise<void> {
    const configured = client
    if (!configured?.resetPersonalRunnerToken) return
    cloudRunnerTokensLoading.value = true
    cloudRunnerTokensError.value = null
    cloudRunnerRegistrationCommand.value = null
    try {
      await configured.resetPersonalRunnerToken()
      await loadRunnerTokens()
    } catch (cause) {
      cloudRunnerTokensError.value = runtimeMessage(cause)
    } finally {
      cloudRunnerTokensLoading.value = false
    }
  }

  async function createRunnerRegistrationCommand(
    input: RunnerRegistrationCommandInput = {},
  ): Promise<void> {
    const configured = client
    if (!configured?.createRunnerRegistrationCommand) return
    cloudRunnerTokensError.value = null
    try {
      cloudRunnerRegistrationCommand.value = await configured.createRunnerRegistrationCommand(input)
    } catch (cause) {
      cloudRunnerTokensError.value = runtimeMessage(cause)
    }
  }

  function clearRunnerRegistrationCommand(): void {
    cloudRunnerRegistrationCommand.value = null
  }

  async function initializeConversationList(force = false): Promise<void> {
    const configured = client
    if (!configured || listLoading.value || (!force && listInitialized)) return
    const generation = lifecycleGeneration
    listLoading.value = true
    listError.value = null
    try {
      const page = await configured.listConversations({
        limit: PAGE_LIMIT,
        filter: cloneConversationScopeFilter(catalogFilter.value),
      })
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
    if (
      !configured ||
      listLoading.value ||
      listLoadingMore.value ||
      !hasMore.value ||
      !nextCursor.value
    ) {
      return
    }
    const generation = lifecycleGeneration
    listLoadingMore.value = true
    listError.value = null
    const cursor = nextCursor.value
    try {
      const page = await configured.listConversations({
        cursor,
        limit: PAGE_LIMIT,
        filter: cloneConversationScopeFilter(catalogFilter.value),
      })
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
    const selected = readyRuntimeId(runtimes.value, id)
    if (!canSelectRuntime.value || !selected || selected === activeRuntimeId.value) return
    activeRuntimeId.value = selected
    selectedModel.value = resolveCurrentModel()
    cleanupSubscription()
    conversationId.value = null
    turns.value = []
  }

  function setDefaultRuntimeId(id: string): void {
    defaultRuntimeId.value = id
  }

  function setDefaultModel(model: string | null): void {
    defaultModel.value = model
    if (conversationId.value === null) selectedModel.value = resolveCurrentModel()
  }

  function setAvailableModelOptions(options: readonly ModelOption[]): void {
    availableModelOptions.value = options.map((option) => ({ ...option }))
    selectedModel.value = resolveModelSelection(
      availableModelOptions.value,
      defaultModel.value ?? selectedModel.value,
    )
  }

  function selectModel(model: string): void {
    selectedModel.value = model
    defaultModel.value = model
  }

  function setExecutionTarget(target: 'local' | 'cloud'): void {
    if (conversationId.value !== null) return
    executionTarget.value = target
    if (target === 'cloud') workingDirectory.value = null
    if (target === 'cloud') void loadRunnerTags()
  }

  function selectRunnerTag(tag: string): void {
    if (conversationId.value !== null) return
    const normalized = tag.trim()
    if (normalized) runnerTags.value = [normalized]
  }

  function setWorkingDirectory(value: string | null): void {
    const normalized = value?.trim() ?? ''
    workingDirectory.value = normalized || null
  }

  async function setCatalogFilter(filter: ConversationScopeFilter): Promise<void> {
    if (filter.kind === catalogFilter.value.kind) return
    catalogFilter.value = filter
    listInitialized = false
    nextCursor.value = null
    hasMore.value = false
    await initializeConversationList(true)
  }

  function startNewConversation(runtimeId?: string): boolean {
    const nextRuntimeId = runtimeId
      ? readyRuntimeId(runtimes.value, runtimeId)
      : resolveNewConversationRuntime()
    selectionToken++
    cleanupSubscription()
    conversationId.value = null
    turns.value = []
    error.value = null
    historyLoading.value = false
    historyLoadingMore.value = false
    historyError.value = null
    historyPageError.value = null
    historyNextCursor.value = null
    historyHasMore.value = false
    activeRuntimeId.value = nextRuntimeId
    workingDirectory.value = null
    executionTarget.value = 'local'
    runnerTags.value = []
    selectedModel.value = resolveCurrentModel()
    permissionMode.value = 'default'
    creationIdempotencyKey = crypto.randomUUID()
    if (!nextRuntimeId) error.value = localizedError('errors.noRuntimeSelected')
    return Boolean(nextRuntimeId)
  }

  async function selectConversation(id: string, forceReload = false): Promise<void> {
    clearCompletedConversation(id)
    if (id === conversationId.value && !forceReload) return
    const configured = client
    if (!configured) {
      historyError.value = localizedError('errors.clientNotConfigured')
      return
    }
    const generation = lifecycleGeneration
    const summary = conversations.value.find((item) => item.conversationId === id)
    if (!summary) return

    const token = ++selectionToken
    cleanupSubscription()
    conversationId.value = id
    activeRuntimeId.value = summary.runtimeId
    workingDirectory.value = summary.workingDirectory ?? null
    executionTarget.value = summary.executionTarget ?? 'local'
    runnerTags.value = [...(summary.runnerTags ?? [])]
    turns.value = []
    error.value = null
    historyLoading.value = true
    historyLoadingMore.value = false
    historyError.value = null
    historyPageError.value = null
    historyNextCursor.value = null
    historyHasMore.value = false
    const bufferedEvents: ConversationEvent[] = []
    let snapshotReady = false
    try {
      const selectedSubscription = await configured.subscribeToEvents(id, (event) => {
        if (token !== selectionToken) return
        if (!snapshotReady) bufferedEvents.push(event)
        else handleEvent(event)
      })
      if (token !== selectionToken || generation !== lifecycleGeneration || client !== configured) {
        selectedSubscription()
        return
      }
      unsubscribe = selectedSubscription
      const [detail, page] = await Promise.all([
        configured.getConversation(id),
        configured.loadConversationHistory({ conversationId: id, limit: HISTORY_PAGE_LIMIT }),
      ])
      if (token !== selectionToken || generation !== lifecycleGeneration || client !== configured)
        return
      conversationId.value = id
      clearCompletedConversation(id)
      activeRuntimeId.value = detail.summary.runtimeId
      workingDirectory.value = detail.summary.workingDirectory ?? null
      executionTarget.value = detail.summary.executionTarget ?? 'local'
      runnerTags.value = [...(detail.summary.runnerTags ?? [])]
      selectedModel.value = resolveCurrentModel()
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
      clearCompletedConversation(id)
      activeRuntimeId.value = summary.runtimeId
      workingDirectory.value = summary.workingDirectory ?? null
      executionTarget.value = summary.executionTarget ?? 'local'
      runnerTags.value = [...(summary.runnerTags ?? [])]
      selectedModel.value = resolveCurrentModel()
      permissionMode.value = 'default'
      historyError.value = runtimeError(cause)
      snapshotReady = true
      for (const event of bufferedEvents) handleEvent(event)
    } finally {
      if (token === selectionToken) historyLoading.value = false
    }
  }

  async function reloadConversation(): Promise<void> {
    const currentId = conversationId.value
    if (currentId) await selectConversation(currentId, true)
  }

  async function relocateConversationWorkspace(workspacePath: string): Promise<boolean> {
    const configured = client
    const currentId = conversationId.value
    if (!configured) {
      historyError.value = localizedError('errors.clientNotConfigured')
      return false
    }
    if (!currentId) {
      historyError.value = localizedError('errors.noActiveConversation')
      return false
    }
    const generation = lifecycleGeneration
    const token = selectionToken
    historyLoading.value = true
    historyError.value = null
    try {
      const detail = await configured.relocateConversationWorkspace(currentId, workspacePath)
      if (
        generation !== lifecycleGeneration ||
        token !== selectionToken ||
        client !== configured ||
        conversationId.value !== currentId
      ) {
        return false
      }
      mergeSummary(detail.summary)
      workingDirectory.value = detail.summary.workingDirectory ?? null
      await selectConversation(currentId, true)
      return historyError.value === null
    } catch (cause) {
      if (generation === lifecycleGeneration && token === selectionToken) {
        historyError.value = runtimeError(cause)
      }
      return false
    } finally {
      if (generation === lifecycleGeneration && token === selectionToken) {
        historyLoading.value = false
      }
    }
  }

  async function loadOlderHistory(): Promise<void> {
    const configured = client
    const currentId = conversationId.value
    const cursor = historyNextCursor.value
    if (!configured || !currentId || !cursor || !historyHasMore.value || historyLoadingMore.value)
      return
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
      if (
        generation !== lifecycleGeneration ||
        client !== configured ||
        token !== selectionToken ||
        conversationId.value !== currentId
      )
        return
      turns.value = mergeHistoryTurns(turns.value, page.items)
      historyNextCursor.value = page.nextCursor
      historyHasMore.value = page.hasMore
    } catch (cause) {
      if (generation === lifecycleGeneration && token === selectionToken) {
        historyPageError.value = runtimeError(cause)
      }
    } finally {
      if (generation === lifecycleGeneration && token === selectionToken)
        historyLoadingMore.value = false
    }
  }

  async function createConversation(): Promise<boolean> {
    const configured = client
    if (!configured || !activeRuntimeId.value) {
      error.value = localizedError('errors.noRuntimeSelected')
      return false
    }
    const generation = lifecycleGeneration
    loading.value = true
    error.value = null
    try {
      // Runner tags load independently when switching to cloud execution. Make
      // the first send wait for that selection instead of creating an invalid
      // request while the background refresh is still in flight.
      if (executionTarget.value === 'cloud' && runnerTags.value.length === 0) {
        await loadRunnerTags()
        if (generation !== lifecycleGeneration || client !== configured) return false
      }
      const result = await configured.createConversation(activeRuntimeId.value, {
        idempotencyKey: creationIdempotencyKey,
        model: selectedModel.value,
        ...(workingDirectory.value ? { workingDirectory: workingDirectory.value } : {}),
        ...(executionTarget.value === 'cloud'
          ? {
              executionTarget: 'cloud' as const,
              runnerTags: [...runnerTags.value],
              permissionMode: permissionMode.value,
              ...cloudModelSelection(selectedModel.value),
            }
          : {}),
      })
      if (generation !== lifecycleGeneration || client !== configured) return false
      selectionToken++
      cleanupSubscription()
      conversationId.value = result.handle.conversationId
      turns.value = []
      historyNextCursor.value = null
      historyHasMore.value = false
      const subscription = await configured.subscribeToEvents(
        result.handle.conversationId,
        handleEvent,
      )
      if (generation !== lifecycleGeneration || client !== configured) {
        subscription()
        return false
      }
      unsubscribe = subscription
      if (result.summary) {
        mergeSummary(result.summary)
      }
      return true
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return false
    } finally {
      if (generation === lifecycleGeneration) loading.value = false
    }
  }

  async function sendMessage(
    text: string,
    attachments: ComposerAttachment[] = [],
  ): Promise<boolean> {
    const configured = client
    if (configured && !conversationId.value) {
      const created = await createConversation()
      if (!created) return false
    }
    const currentId = conversationId.value
    if (!configured || !currentId) {
      // Keep the creation failure visible. The generic no-active-session
      // message is only useful when no client/session was available at all.
      if (!error.value) error.value = localizedError('errors.noActiveConversation')
      return false
    }
    const generation = lifecycleGeneration
    const turnId = crypto.randomUUID()
    const turn = createConversationTurn(
      turnId,
      crypto.randomUUID(),
      text,
      attachments.map((attachment) => attachment.name),
      0,
    )
    turns.value = [...turns.value, turn]
    error.value = null
    void configured
      .sendMessage(currentId, text, {
        model: selectedModel.value,
        permissionMode: permissionMode.value,
      })
      .catch((cause) => {
        if (generation !== lifecycleGeneration || client !== configured) return
        const message = runtimeErrorMessage(cause)
        updateTurn(turnId, (current) =>
          failConversationTurn(current, {
            code: 'internal',
            message,
            retryable: false,
          }),
        )
        error.value = runtimeError(cause)
      })
    return true
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
    clearConversationActivity(currentId)
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
    unsubscribeAllEvents?.()
    unsubscribeAllEvents = null
    client = null
    runtimes.value = []
    conversations.value = []
    catalogFilter.value = { kind: 'all' }
    activeRuntimeId.value = null
    selectedModel.value = 'default'
    workingDirectory.value = null
    executionTarget.value = 'local'
    runnerTags.value = []
    cloudRunnerTags.value = []
    cloudRunnerTokens.value = []
    cloudRunnerRegistrationCommand.value = null
    cloudRunnerTokensError.value = null
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
    availableModelOptions.value = []
    runningConversationIds.value = new Set()
    completedConversationIds.value = new Set()
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
    const turn = [...turns.value].reverse().find((candidate) => findApproval(candidate, approvalId))
    const request = turn ? findApproval(turn, approvalId) : undefined
    if (!turn || !request || (request.status !== 'pending' && request.status !== 'failed')) return
    updateTurn(turn.id, (current) => setApprovalResolving(current, approvalId, decision))
    try {
      await configured.respondToApproval(currentId, approvalId, decision)
      if (generation !== lifecycleGeneration || client !== configured) return
      updateTurn(turn.id, (current) => completeApproval(current, approvalId, decision))
    } catch (cause) {
      if (generation === lifecycleGeneration) {
        updateTurn(turn.id, (current) =>
          setApprovalFailed(
            current,
            approvalId,
            cause instanceof Error ? cause.message : String(cause),
          ),
        )
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
      conversations.value = conversations.value.filter((item) => item.conversationId !== id)
      clearConversationActivity(id)
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
      conversations.value = conversations.value.filter((item) => item.conversationId !== id)
      clearConversationActivity(id)
      if (conversationId.value === id) startNewConversation()
    } catch (cause) {
      if (generation === lifecycleGeneration) listError.value = runtimeError(cause)
    }
  }

  function handleEvent(event: ConversationEvent): void {
    if (event.conversationId !== conversationId.value) return
    const turn = turns.value.at(-1)
    if (!turn || (turn.status !== 'sending' && turn.status !== 'running')) return
    updateTurn(turn.id, (current) => reduceConversationTurn(current, event))
  }

  function trackConversationActivity(event: ConversationEvent): void {
    const running = new Set(runningConversationIds.value)
    const completed = new Set(completedConversationIds.value)
    if (event.event.type === 'runStarted') {
      running.add(event.conversationId)
      completed.delete(event.conversationId)
    } else if (
      event.event.type === 'runFinished' ||
      event.event.type === 'runFailed' ||
      (event.event.type === 'messageDelta' && event.event.terminal === true)
    ) {
      running.delete(event.conversationId)
      if (event.conversationId === conversationId.value) completed.delete(event.conversationId)
      else completed.add(event.conversationId)
    } else {
      return
    }
    runningConversationIds.value = running
    completedConversationIds.value = completed
  }

  function clearCompletedConversation(id: string): void {
    if (!completedConversationIds.value.has(id)) return
    const completed = new Set(completedConversationIds.value)
    completed.delete(id)
    completedConversationIds.value = completed
  }

  function markConversationSeen(id: string): void {
    clearCompletedConversation(id)
  }

  function clearConversationActivity(id: string): void {
    const running = new Set(runningConversationIds.value)
    const completed = new Set(completedConversationIds.value)
    running.delete(id)
    completed.delete(id)
    runningConversationIds.value = running
    completedConversationIds.value = completed
  }

  function mergeSummary(summary: ConversationSummary): void {
    const withoutCurrent = conversations.value.filter(
      (item) => item.conversationId !== summary.conversationId,
    )
    conversations.value =
      summary.archivedAt || !matchesFilter(summary, catalogFilter.value)
        ? withoutCurrent
        : uniqueSorted([summary, ...withoutCurrent])
  }

  function updateTurn(turnId: string, update: (turn: ConversationTurn) => ConversationTurn): void {
    turns.value = turns.value.map((turn) => (turn.id === turnId ? update(turn) : turn))
  }

  function cleanupSubscription(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  function resolveNewConversationRuntime(): string | null {
    return resolvePreferredRuntimeId(runtimes.value, defaultRuntimeId.value)
  }

  function resolveCurrentModel(): string {
    return resolveModelSelection(availableModelOptions.value, defaultModel.value)
  }

  return {
    runtimes,
    conversations,
    catalogFilter,
    defaultRuntimeId,
    defaultModel,
    activeRuntime,
    activeConversation,
    activeRuntimeId,
    selectedModel,
    workingDirectory,
    executionTarget,
    runnerTags,
    cloudRunnerTags,
    cloudRunnerTokens,
    cloudRunnerRegistrationCommand,
    cloudRunnerTokensLoading,
    cloudRunnerTokensError,
    loadRunnerTokens,
    resetPersonalRunnerToken,
    createRunnerRegistrationCommand,
    clearRunnerRegistrationCommand,
    permissionMode,
    modelOptions,
    setDefaultModel,
    setAvailableModelOptions,
    selectModel,
    setWorkingDirectory,
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
    runningConversationIds,
    completedConversationIds,
    canSend,
    canSelectRuntime,
    hasConversations,
    configure,
    loadRuntimes,
    loadRunnerTags,
    initializeConversationList,
    loadMoreConversations,
    selectRuntime,
    setDefaultRuntimeId,
    setExecutionTarget,
    selectRunnerTag,
    setCatalogFilter,
    startNewConversation,
    selectConversation,
    reloadConversation,
    relocateConversationWorkspace,
    markConversationSeen,
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
  return (
    binding?.transportId === filter.binding.transportId &&
    binding.accountRef === filter.binding.accountRef &&
    binding.channelRef === filter.binding.channelRef
  )
}

function cloneConversationScopeFilter(filter: ConversationScopeFilter): ConversationScopeFilter {
  if (filter.kind === 'binding') {
    return { kind: 'binding', binding: { ...filter.binding } }
  }
  return { kind: filter.kind }
}

function uniqueSorted(items: ConversationSummary[]): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>()
  for (const item of items) byId.set(item.conversationId, item)
  return [...byId.values()].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.conversationId.localeCompare(left.conversationId),
  )
}

function runtimeMessage(value: unknown): string {
  return runtimeErrorValue(value).message
}

function runtimeErrorValue(value: unknown): Error {
  if (value instanceof Error) return value
  return new Error(runtimeErrorMessage(value))
}

function runtimeErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as { code?: unknown; message?: unknown }
    if (typeof candidate.message === 'string' && candidate.message) return candidate.message
    if (typeof candidate.code === 'string' && candidate.code) return candidate.code
  }
  return 'Unknown runtime error'
}

export function mergeHistoryTurns(
  current: ConversationTurn[],
  older: ConversationTurn[],
): ConversationTurn[] {
  const currentIds = new Set(current.map((turn) => turn.id))
  return [...structuredClone(older.filter((turn) => !currentIds.has(turn.id))), ...current]
}

function cloudModelSelection(model: string): { providerId?: string; modelId?: string } {
  const separator = model.indexOf('/')
  if (separator <= 0 || separator === model.length - 1) return {}
  return { providerId: model.slice(0, separator), modelId: model.slice(separator + 1) }
}
