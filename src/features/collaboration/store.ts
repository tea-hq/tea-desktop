import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type { ChannelTransport, Message } from '@/features/channels/contracts'
import type {
  ApprovalDecision,
  ConversationClient,
  ConversationDetail,
  ConversationEvent,
  ConversationSummary,
  ConversationTurn,
  ConversationUiError,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '@/features/conversation/contracts'
import {
  cancelConversationTurn,
  completeApproval,
  createConversationTurn,
  failConversationTurn,
  findApproval,
  reduceConversationTurn,
  setApprovalFailed,
  setApprovalResolving,
} from '@/features/conversation/timelineReducer'
import { ConversationCollaborationClient } from '@/infrastructure/collaboration/ConversationCollaborationClient'
import { resolveModelSelection } from '@/features/conversation/modelOptions'
import { readyRuntimeId, resolvePreferredRuntimeId } from '@/features/conversation/runtimeSelection'
import type {
  ChannelBinding,
  ChannelSource,
  ChannelSourceInput,
  CollaborationSnapshot,
  Draft,
} from '@/types/channelCollaboration'
import { messageToChannelSource } from './channelPrompt'
import { useAgentDrawerStore } from './agentDrawerStore'

const PAGE_LIMIT = 30

export const useCollaborationStore = defineStore('collaboration', () => {
  const conversationClient = shallowRef<ConversationClient | null>(null)
  const channelTransport = shallowRef<ChannelTransport | null>(null)
  const bridge = shallowRef<ConversationCollaborationClient | null>(null)
  const runtimes = ref<RuntimeDescriptor[]>([])
  const conversations = ref<ConversationSummary[]>([])
  const activeBinding = ref<ChannelBinding | null>(null)
  const conversationId = ref<string | null>(null)
  const turns = ref<ConversationTurn[]>([])
  const collaboration = ref<CollaborationSnapshot>(emptyCollaboration())
  const drawer = useAgentDrawerStore()
  const stagedSources = computed(() =>
    activeBinding.value ? drawer.ensureState(activeBinding.value).draft.sources : [],
  )
  const chooserOpen = ref(false)
  const loading = ref(false)
  const sending = ref(false)
  const error = ref<ConversationUiError | null>(null)
  const selectedRuntimeId = ref<string | null>(null)
  const defaultModel = ref<string | null>(null)
  const selectedModel = ref('default')
  const permissionMode = ref<PermissionMode>('default')
  const availableModelOptions = ref<ModelOption[]>([])
  const userDefaultRuntimeId = ref<string | null>(null)
  let unsubscribeEvents: (() => void) | null = null
  let unsubscribeUpdates: (() => void) | null = null
  let cleanupTurnHistory: (() => void) | null = null
  let selectionToken = 0
  let lifecycleGeneration = 0
  let conversationLoad: { binding: ChannelBinding; promise: Promise<void> } | null = null

  const activeConversation = computed(
    () =>
      conversations.value.find((value) => value.conversationId === conversationId.value) ?? null,
  )
  const activeRuntime = computed(
    () =>
      runtimes.value.find(
        (value) => value.id === (activeConversation.value?.runtimeId ?? selectedRuntimeId.value),
      ) ?? null,
  )
  const isStreaming = computed(() => {
    const status = turns.value.at(-1)?.status
    return status === 'sending' || status === 'running'
  })
  const canSend = computed(() =>
    Boolean(
      activeBinding.value &&
      selectedRuntimeId.value &&
      !loading.value &&
      !sending.value &&
      !isStreaming.value,
    ),
  )

  function configure(client: ConversationClient, transport: ChannelTransport): void {
    if (conversationClient.value === client && channelTransport.value === transport) return
    lifecycleGeneration += 1
    const generation = lifecycleGeneration
    conversationLoad = null
    disposeSubscriptions()
    unsubscribeUpdates?.()
    conversationClient.value = client
    channelTransport.value = transport
    bridge.value = new ConversationCollaborationClient(client, transport)
    unsubscribeUpdates = client.subscribeToConversationUpdates((summary) => {
      if (
        generation === lifecycleGeneration &&
        summary.channelBinding &&
        sameBinding(summary.channelBinding, activeBinding.value)
      )
        mergeSummary(summary)
    })
  }

  async function loadRuntimes(): Promise<void> {
    const client = requireClient()
    const generation = lifecycleGeneration
    const values = (await client.listRuntimes()).filter(
      (runtime) =>
        runtime.capabilities.includes('prompt') &&
        runtime.capabilities.includes('events') &&
        runtime.capabilities.includes('hostTools'),
    )
    if (generation !== lifecycleGeneration || conversationClient.value !== client) return
    runtimes.value = values
    if (!conversationId.value) {
      selectedRuntimeId.value =
        readyRuntimeId(runtimes.value, selectedRuntimeId.value) ??
        runtimes.value.find((runtime) => runtime.status === 'ready')?.id ??
        null
    }
  }

  function selectRuntime(runtimeId: string): void {
    if (conversationId.value || loading.value || sending.value || isStreaming.value) return
    const selected = readyRuntimeId(runtimes.value, runtimeId)
    if (!selected) return
    clearSelection()
    selectedRuntimeId.value = selected
    if (activeBinding.value) drawer.updateDraft(activeBinding.value, { runtimeId: selected })
    selectedModel.value = resolveCurrentModel()
    error.value = null
    chooserOpen.value = false
  }

  async function bindChannel(channelRef: string): Promise<void> {
    const transport = requireTransport()
    const status = transport.status()
    const next =
      channelRef && status.phase === 'connected' && status.accountRef
        ? { transportId: transport.descriptor().id, accountRef: status.accountRef, channelRef }
        : null
    if (sameBinding(next, activeBinding.value)) {
      if (next && conversationLoad && sameBinding(next, conversationLoad.binding)) {
        await conversationLoad.promise
      }
      return
    }
    activeBinding.value = next
    drawer.activateBinding(next)
    chooserOpen.value = false
    clearSelection()
    conversations.value = []
    if (!next) return
    const state = drawer.ensureState(next)
    const selectedRuntimeReady = runtimes.value.some(
      (runtime) => runtime.id === selectedRuntimeId.value && runtime.status === 'ready',
    )
    if (!state.draft.runtimeId && selectedRuntimeReady) {
      drawer.updateDraft(next, { runtimeId: selectedRuntimeId.value })
    }
    const promise = loadConversations()
    conversationLoad = { binding: { ...next }, promise }
    try {
      await promise
    } finally {
      if (conversationLoad?.promise === promise) conversationLoad = null
    }
  }

  async function loadConversations(): Promise<void> {
    const binding = activeBinding.value
    if (!binding) return
    const client = requireClient()
    const generation = lifecycleGeneration
    loading.value = true
    error.value = null
    try {
      const page = await client.listConversations({
        limit: PAGE_LIMIT,
        filter: { kind: 'binding', binding: { ...binding } },
      })
      if (
        generation !== lifecycleGeneration ||
        conversationClient.value !== client ||
        !sameBinding(binding, activeBinding.value)
      )
        return
      conversations.value = uniqueSorted(page.items)
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
    } finally {
      if (generation === lifecycleGeneration) loading.value = false
    }
  }

  async function createConversation(runtimeId?: string): Promise<string | null> {
    const binding = activeBinding.value
    const selected = runtimeId
      ? readyRuntimeId(runtimes.value, runtimeId)
      : resolveNewConversationRuntime()
    if (!binding || !selected) {
      error.value = { kind: 'localized', key: 'errors.noRuntimeSelected' }
      return null
    }
    clearSelection()
    selectedRuntimeId.value = selected
    selectedModel.value = resolveCurrentModel()
    permissionMode.value = 'default'
    drawer.prepare(binding, selected)
    drawer.updateDraft(binding, {
      runtimeId: selected,
      model: selectedModel.value,
      permissionMode: permissionMode.value,
    })
    error.value = null
    return null
  }

  async function createConversationForMessage(
    runtimeId: string,
    message: Message,
  ): Promise<boolean> {
    if (
      !activeBinding.value ||
      !runtimes.value.some((runtime) => runtime.id === runtimeId && runtime.status === 'ready')
    )
      return false
    await createConversation(runtimeId)
    stageMessage(message, { openChooser: false })
    return true
  }

  async function selectConversation(id: string, forceReload = false): Promise<boolean> {
    if (id === conversationId.value && !forceReload) return true
    const summary = conversations.value.find((value) => value.conversationId === id)
    if (
      !summary ||
      !summary.channelBinding ||
      !sameBinding(summary.channelBinding, activeBinding.value)
    ) {
      error.value = { kind: 'localized', key: 'errors.conversationUnavailable' }
      return false
    }
    const client = requireClient()
    const generation = lifecycleGeneration
    const token = ++selectionToken
    disposeSubscriptions()
    conversationId.value = id
    selectedRuntimeId.value = summary.runtimeId
    turns.value = []
    collaboration.value = emptyCollaboration()
    loading.value = true
    error.value = null
    const buffered: ConversationEvent[] = []
    let ready = false
    try {
      const subscription = await client.subscribeToEvents(id, (event) => {
        if (token !== selectionToken) return
        if (!ready) buffered.push(event)
        else handleEvent(event)
      })
      if (
        token !== selectionToken ||
        generation !== lifecycleGeneration ||
        conversationClient.value !== client
      ) {
        subscription()
        return false
      }
      unsubscribeEvents = subscription
      const [detail, history] = await Promise.all([
        client.getConversation(id),
        client.loadConversationHistory({ conversationId: id, limit: 50 }),
      ])
      if (
        token !== selectionToken ||
        generation !== lifecycleGeneration ||
        conversationClient.value !== client
      )
        return false
      applyDetail(detail, history.items)
      selectedModel.value = resolveCurrentModel()
      permissionMode.value = 'default'
      if (activeBinding.value)
        drawer.updateDraft(activeBinding.value, {
          runtimeId: selectedRuntimeId.value,
          model: selectedModel.value,
          permissionMode: permissionMode.value,
        })
      if (activeBinding.value) drawer.selectConversation(activeBinding.value, id)
      ready = true
      buffered.forEach(handleEvent)
      return true
    } catch (cause) {
      if (token === selectionToken) {
        selectedModel.value = resolveCurrentModel()
        permissionMode.value = 'default'
        error.value = runtimeError(cause)
      }
      return false
    } finally {
      if (token === selectionToken) loading.value = false
    }
  }

  async function reloadConversation(): Promise<void> {
    const currentId = conversationId.value
    if (currentId) await selectConversation(currentId, true)
  }

  async function relocateConversationWorkspace(workspacePath: string): Promise<boolean> {
    const client = conversationClient.value
    const currentId = conversationId.value
    if (!client) {
      error.value = { kind: 'localized', key: 'errors.clientNotConfigured' }
      return false
    }
    if (!currentId) {
      error.value = { kind: 'localized', key: 'errors.noActiveConversation' }
      return false
    }
    const generation = lifecycleGeneration
    const token = selectionToken
    loading.value = true
    error.value = null
    try {
      const detail = await client.relocateConversationWorkspace(currentId, workspacePath)
      if (
        generation !== lifecycleGeneration ||
        token !== selectionToken ||
        conversationClient.value !== client ||
        conversationId.value !== currentId
      ) {
        return false
      }
      if (!sameBinding(detail.summary.channelBinding ?? null, activeBinding.value)) {
        throw new Error('conversationBindingMismatch')
      }
      mergeSummary(detail.summary)
      return selectConversation(currentId, true)
    } catch (cause) {
      if (generation === lifecycleGeneration && token === selectionToken) {
        error.value = runtimeError(cause)
      }
      return false
    } finally {
      if (generation === lifecycleGeneration && token === selectionToken) {
        loading.value = false
      }
    }
  }

  async function renameConversation(id: string, title: string): Promise<boolean> {
    const nextTitle = title.trim()
    if (!nextTitle || !conversations.value.some((value) => value.conversationId === id))
      return false
    const client = requireClient()
    const generation = lifecycleGeneration
    try {
      await client.renameConversation(id, nextTitle)
      return generation === lifecycleGeneration && conversationClient.value === client
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return false
    }
  }

  async function archiveConversation(id: string): Promise<boolean> {
    if (!conversations.value.some((value) => value.conversationId === id)) return false
    const client = requireClient()
    const generation = lifecycleGeneration
    try {
      await client.archiveConversation(id)
      if (generation !== lifecycleGeneration || conversationClient.value !== client) return false
      conversations.value = conversations.value.filter((value) => value.conversationId !== id)
      if (conversationId.value === id) clearSelection()
      return true
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return false
    }
  }

  function removeConversationFromIndex(id: string): void {
    conversations.value = conversations.value.filter((value) => value.conversationId !== id)
    if (conversationId.value === id) clearSelection()
  }

  function stageMessage(message: Message, options: { openChooser?: boolean } = {}): void {
    if (!activeBinding.value || message.ref.channelRef !== activeBinding.value.channelRef) return
    const source = messageToChannelSource(message)
    drawer.stageSource(activeBinding.value, source)
    if (options.openChooser ?? true) chooserOpen.value = true
  }

  function removeStagedSource(messageClientId: string): void {
    if (activeBinding.value) drawer.removeSource(activeBinding.value, messageClientId)
  }

  async function sendMessage(text: string): Promise<void> {
    const client = requireClient()
    const currentBridge = requireBridge()
    const generation = lifecycleGeneration
    const binding = activeBinding.value
    const trimmed = text.trim()
    if (!binding || !trimmed || !canSend.value) return
    drawer.updateDraft(binding, {
      runtimeId: selectedRuntimeId.value,
      model: selectedModel.value,
      permissionMode: permissionMode.value,
      text: trimmed,
    })
    const currentId = conversationId.value ?? (await createConversationOnFirstSend(binding))
    if (
      !currentId ||
      generation !== lifecycleGeneration ||
      conversationClient.value !== client ||
      !sameBinding(binding, activeBinding.value)
    )
      return
    const sources = stagedSources.value.map(cloneSourceInput)
    const turnIndex = turns.value.length
    const turnId = crypto.randomUUID()
    turns.value = [
      ...turns.value,
      createConversationTurn(turnId, crypto.randomUUID(), trimmed, [], 0),
    ]
    sending.value = true
    error.value = null
    try {
      cleanupTurnHistory?.()
      const historyCleanup = await currentBridge.attachTurnHistory(
        currentId,
        binding.channelRef,
        turnIndex,
        sources.map((source) => source.messageRef),
        (persisted) => {
          if (generation === lifecycleGeneration) appendPersistedSources(turnIndex, persisted)
        },
      )
      if (generation !== lifecycleGeneration || conversationClient.value !== client) {
        historyCleanup()
        return
      }
      cleanupTurnHistory = historyCleanup
      await client.sendMessage(currentId, trimmed, {
        model: selectedModel.value,
        permissionMode: permissionMode.value,
        sources,
      })
      if (generation !== lifecycleGeneration || conversationClient.value !== client) return
      drawer.consumeAcceptedInput(binding)
      await refreshCollaboration()
    } catch (cause) {
      if (generation === lifecycleGeneration) {
        cleanupTurnHistory?.()
        cleanupTurnHistory = null
        updateTurn(turnId, (turn) =>
          failConversationTurn(turn, {
            code: 'internal',
            message: cause instanceof Error ? cause.message : String(cause),
            retryable: false,
          }),
        )
        error.value = runtimeError(cause)
      }
    } finally {
      if (generation === lifecycleGeneration) sending.value = false
    }
  }

  async function createDraft(
    turnIndex: number,
    blockId: string,
    content: string,
  ): Promise<Draft | null> {
    const currentId = conversationId.value
    if (!currentId || !content.trim()) return null
    const client = requireClient()
    const generation = lifecycleGeneration
    try {
      const draft = await client.createDraft(currentId, turnIndex, blockId, content)
      if (generation !== lifecycleGeneration || conversationClient.value !== client) return null
      collaboration.value.drafts = [draft, ...collaboration.value.drafts]
      return draft
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return null
    }
  }

  async function updateDraft(draftId: string, content: string): Promise<Draft | null> {
    const client = requireClient()
    const generation = lifecycleGeneration
    try {
      const draft = await client.updateDraft(draftId, content)
      if (generation !== lifecycleGeneration || conversationClient.value !== client) return null
      collaboration.value.drafts = collaboration.value.drafts.map((value) =>
        value.draftId === draftId ? draft : value,
      )
      return draft
    } catch (cause) {
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return null
    }
  }

  async function deliverDraft(draftId: string): Promise<void> {
    if (sending.value) return
    const draft = collaboration.value.drafts.find((value) => value.draftId === draftId)
    if (!draft) return
    const currentBridge = requireBridge()
    const generation = lifecycleGeneration
    sending.value = true
    error.value = null
    try {
      const delivery = await currentBridge.deliverDraft(
        draft,
        activeRuntime.value?.displayName ?? 'Agent',
      )
      if (generation !== lifecycleGeneration || bridge.value !== currentBridge) return
      collaboration.value.deliveries = [
        delivery,
        ...collaboration.value.deliveries.filter(
          (value) => value.deliveryId !== delivery.deliveryId,
        ),
      ]
    } catch (cause) {
      if (generation === lifecycleGeneration) {
        error.value = runtimeError(cause)
        await refreshCollaboration()
      }
    } finally {
      if (generation === lifecycleGeneration) sending.value = false
    }
  }

  async function cancel(): Promise<void> {
    const currentId = conversationId.value
    if (!currentId) {
      if (activeBinding.value) drawer.cancelDraft(activeBinding.value)
      return
    }
    const client = requireClient()
    const generation = lifecycleGeneration
    await client.cancelConversation(currentId)
    if (generation !== lifecycleGeneration || conversationClient.value !== client) return
    cleanupTurnHistory?.()
    cleanupTurnHistory = null
    const turn = turns.value.at(-1)
    if (turn) updateTurn(turn.id, cancelConversationTurn)
  }

  async function respondToApproval(approvalId: string, decision: ApprovalDecision): Promise<void> {
    const currentId = conversationId.value
    if (!currentId) return
    const turn = [...turns.value].reverse().find((candidate) => findApproval(candidate, approvalId))
    const approval = turn ? findApproval(turn, approvalId) : undefined
    if (!turn || !approval || (approval.status !== 'pending' && approval.status !== 'failed'))
      return
    const client = requireClient()
    const generation = lifecycleGeneration
    updateTurn(turn.id, (value) => setApprovalResolving(value, approvalId, decision))
    try {
      await client.respondToApproval(currentId, approvalId, decision)
      if (generation !== lifecycleGeneration || conversationClient.value !== client) return
      updateTurn(turn.id, (value) => completeApproval(value, approvalId, decision))
    } catch (cause) {
      if (generation === lifecycleGeneration) {
        updateTurn(turn.id, (value) =>
          setApprovalFailed(
            value,
            approvalId,
            cause instanceof Error ? cause.message : String(cause),
          ),
        )
      }
    }
  }

  function openChooser(): void {
    chooserOpen.value = true
  }

  function closeChooser(): void {
    chooserOpen.value = false
  }

  function handleEvent(event: ConversationEvent): void {
    if (event.conversationId !== conversationId.value) return
    const turn = turns.value.at(-1)
    if (!turn || (turn.status !== 'sending' && turn.status !== 'running')) return
    updateTurn(turn.id, (current) => reduceConversationTurn(current, event))
    if (event.event.type === 'runFinished' || event.event.type === 'runFailed') {
      cleanupTurnHistory?.()
      cleanupTurnHistory = null
      void refreshCollaboration()
    }
  }

  async function refreshCollaboration(): Promise<void> {
    const currentId = conversationId.value
    if (!currentId) return
    const client = requireClient()
    const generation = lifecycleGeneration
    try {
      const detail = await client.getConversation(currentId)
      if (
        generation !== lifecycleGeneration ||
        conversationClient.value !== client ||
        conversationId.value !== currentId
      )
        return
      collaboration.value = structuredClone(detail.collaboration)
      mergeSummary(detail.summary)
    } catch {
      // The current event projection remains usable if a refresh races persistence.
    }
  }

  function appendPersistedSources(turnIndex: number, sources: ChannelSource[]): void {
    const context = collaboration.value.turnContexts.find((value) => value.turnIndex === turnIndex)
    if (context) context.sources.push(...sources)
  }

  function applyDetail(detail: ConversationDetail, history: ConversationTurn[]): void {
    if (!sameBinding(detail.summary.channelBinding ?? null, activeBinding.value)) {
      throw new Error('conversationBindingMismatch')
    }
    conversationId.value = detail.summary.conversationId
    selectedRuntimeId.value = detail.summary.runtimeId
    turns.value = structuredClone(history)
    collaboration.value = structuredClone(detail.collaboration)
    mergeSummary(detail.summary)
  }

  function updateTurn(id: string, update: (turn: ConversationTurn) => ConversationTurn): void {
    turns.value = turns.value.map((turn) => (turn.id === id ? update(turn) : turn))
  }

  function mergeSummary(summary: ConversationSummary): void {
    if (summary.archivedAt) {
      conversations.value = conversations.value.filter(
        (value) => value.conversationId !== summary.conversationId,
      )
      if (conversationId.value === summary.conversationId) clearSelection()
      return
    }
    conversations.value = uniqueSorted([
      summary,
      ...conversations.value.filter((value) => value.conversationId !== summary.conversationId),
    ])
  }

  function clearSelection(): void {
    selectionToken++
    disposeSubscriptions()
    conversationId.value = null
    turns.value = []
    collaboration.value = emptyCollaboration()
    loading.value = false
  }

  async function createConversationOnFirstSend(binding: ChannelBinding): Promise<string | null> {
    const client = requireClient()
    const generation = lifecycleGeneration
    const state = drawer.ensureState(binding)
    const runtimeId = resolveDraftRuntime(binding)
    if (!runtimeId) {
      error.value = { kind: 'localized', key: 'errors.noRuntimeSelected' }
      return null
    }
    if (state.phase === 'index') drawer.prepare(binding, runtimeId)
    drawer.updateDraft(binding, { runtimeId })
    const key = drawer.beginCreation(binding)
    if (!key) return state.draft.conversationId
    loading.value = true
    error.value = null
    try {
      const created = await client.createConversation(runtimeId, {
        idempotencyKey: key,
        model: state.draft.model,
        channelBinding: { ...binding },
        hostTools: requireBridge().creationHostTools(),
      })
      if (
        generation !== lifecycleGeneration ||
        conversationClient.value !== client ||
        !sameBinding(binding, activeBinding.value)
      )
        return null
      if (created.summary) mergeSummary(created.summary)
      if (!drawer.completeCreation(binding, key, created.handle.conversationId)) return null
      const selected = await selectConversation(created.handle.conversationId)
      return selected ? created.handle.conversationId : null
    } catch (cause) {
      drawer.creationFailed(binding, key)
      if (generation === lifecycleGeneration) error.value = runtimeError(cause)
      return null
    } finally {
      if (generation === lifecycleGeneration) loading.value = false
    }
  }

  function resolveDraftRuntime(binding: ChannelBinding): string | null {
    const ready = (id: string | null | undefined) =>
      runtimes.value.find((runtime) => runtime.id === id && runtime.status === 'ready')?.id
    const state = drawer.ensureState(binding)
    return (
      ready(state.draft.runtimeId) ??
      ready(
        conversations.value.find(
          (summary) => summary.channelBinding && sameBinding(summary.channelBinding, binding),
        )?.runtimeId,
      ) ??
      ready(userDefaultRuntimeId.value) ??
      runtimes.value.find((runtime) => runtime.status === 'ready')?.id ??
      null
    )
  }

  function resolveNewConversationRuntime(): string | null {
    return resolvePreferredRuntimeId(runtimes.value, userDefaultRuntimeId.value)
  }

  function setDefaultRuntimeId(runtimeId: string): void {
    userDefaultRuntimeId.value = runtimeId
  }

  function setDefaultModel(model: string | null): void {
    defaultModel.value = model
    if (!conversationId.value) syncModelSelection()
  }

  function setAvailableModelOptions(options: readonly ModelOption[]): void {
    availableModelOptions.value = options.map((option) => ({ ...option }))
    selectedModel.value = resolveModelSelection(
      availableModelOptions.value,
      defaultModel.value ?? selectedModel.value,
    )
    if (activeBinding.value) drawer.updateDraft(activeBinding.value, { model: selectedModel.value })
  }

  function selectModel(model: string): void {
    selectedModel.value = model
    defaultModel.value = model
  }

  function resolveCurrentModel(): string {
    return resolveModelSelection(availableModelOptions.value, defaultModel.value)
  }

  function syncModelSelection(): void {
    selectedModel.value = resolveCurrentModel()
    if (activeBinding.value) drawer.updateDraft(activeBinding.value, { model: selectedModel.value })
  }

  function disposeSubscriptions(): void {
    unsubscribeEvents?.()
    unsubscribeEvents = null
    cleanupTurnHistory?.()
    cleanupTurnHistory = null
  }

  function dispose(): void {
    lifecycleGeneration += 1
    clearSelection()
    unsubscribeUpdates?.()
    unsubscribeUpdates = null
    conversationClient.value = null
    channelTransport.value = null
    bridge.value = null
    runtimes.value = []
    conversations.value = []
    activeBinding.value = null
    conversationLoad = null
    drawer.dispose()
    chooserOpen.value = false
    loading.value = false
    sending.value = false
    error.value = null
    selectedRuntimeId.value = null
    selectedModel.value = 'default'
    permissionMode.value = 'default'
    availableModelOptions.value = []
    userDefaultRuntimeId.value = null
  }

  function requireClient(): ConversationClient {
    if (!conversationClient.value) throw new Error('conversationClientNotConfigured')
    return conversationClient.value
  }

  function requireTransport(): ChannelTransport {
    if (!channelTransport.value) throw new Error('channelTransportNotConfigured')
    return channelTransport.value
  }

  function requireBridge(): ConversationCollaborationClient {
    if (!bridge.value) throw new Error('collaborationClientNotConfigured')
    return bridge.value
  }

  return {
    runtimes,
    conversations,
    activeBinding,
    conversationId,
    activeConversation,
    activeRuntime,
    turns,
    collaboration,
    stagedSources,
    chooserOpen,
    loading,
    sending,
    error,
    selectedRuntimeId,
    defaultModel,
    selectedModel,
    permissionMode,
    userDefaultRuntimeId,
    isStreaming,
    canSend,
    configure,
    loadRuntimes,
    bindChannel,
    loadConversations,
    createConversation,
    createConversationForMessage,
    selectRuntime,
    setDefaultRuntimeId,
    setDefaultModel,
    setAvailableModelOptions,
    selectModel,
    selectConversation,
    reloadConversation,
    relocateConversationWorkspace,
    renameConversation,
    archiveConversation,
    removeConversationFromIndex,
    stageMessage,
    removeStagedSource,
    sendMessage,
    createDraft,
    updateDraft,
    deliverDraft,
    cancel,
    respondToApproval,
    openChooser,
    closeChooser,
    dispose,
  }
})

function emptyCollaboration(): CollaborationSnapshot {
  return { turnContexts: [], drafts: [], deliveries: [] }
}

function sameBinding(left: ChannelBinding | null, right: ChannelBinding | null): boolean {
  return (
    left?.transportId === right?.transportId &&
    left?.accountRef === right?.accountRef &&
    left?.channelRef === right?.channelRef
  )
}

function uniqueSorted(values: ConversationSummary[]): ConversationSummary[] {
  const byId = new Map(values.map((value) => [value.conversationId, value]))
  return [...byId.values()].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.conversationId.localeCompare(left.conversationId),
  )
}

function runtimeError(value: unknown): ConversationUiError {
  const candidate = value as { code?: unknown; message?: unknown; retryable?: unknown } | null
  const message =
    candidate && typeof candidate.message === 'string'
      ? candidate.message
      : value instanceof Error
        ? value.message
        : candidate && typeof candidate.code === 'string'
          ? candidate.code
          : typeof value === 'string'
            ? value
            : 'Unknown runtime error'
  return {
    kind: 'runtime',
    message,
    code: candidate && typeof candidate.code === 'string' ? candidate.code : 'runtimeFailure',
    retryable: candidate?.retryable === true,
  }
}

function cloneSourceInput(source: ChannelSourceInput): ChannelSourceInput {
  return {
    messageRef: { ...source.messageRef },
    senderName: source.senderName,
    sentAt: source.sentAt,
    sentByCurrentUser: source.sentByCurrentUser,
    text: source.text,
    capturedAt: source.capturedAt,
    state: source.state,
  }
}
