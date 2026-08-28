import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'

import type { ComposerAttachment, PermissionMode } from '@/features/conversation/contracts'
import type { ChannelBinding, ChannelSourceInput } from '@/types/channelCollaboration'
import { sameSource } from './channelPrompt'
import {
  serializeChannelBinding,
  type AgentDrawerChannelState,
  type AgentDrawerDraft,
  type AgentSessionListMode,
} from './agentDrawerContracts'

export const useAgentDrawerStore = defineStore('agent-drawer', () => {
  const states = reactive(new Map<string, AgentDrawerChannelState>())
  const activeKey = ref<string | null>(null)
  const activeState = computed(() =>
    activeKey.value ? (states.get(activeKey.value) ?? null) : null,
  )

  function activateBinding(binding: ChannelBinding | null): void {
    activeKey.value = binding ? serializeChannelBinding(binding) : null
    if (binding) ensureState(binding)
  }

  function prepare(binding: ChannelBinding, runtimeId: string | null): void {
    const state = ensureState(binding)
    state.phase = 'preparing'
    state.selectedConversationId = null
    if (runtimeId) state.draft.runtimeId = runtimeId
  }

  function beginCreation(binding: ChannelBinding): string | null {
    const state = ensureState(binding)
    if (state.phase !== 'preparing' || !state.draft.runtimeId) return null
    state.phase = 'creating'
    return state.draft.creationIdempotencyKey
  }

  function completeCreation(binding: ChannelBinding, key: string, conversationId: string): boolean {
    const state = ensureState(binding)
    if (state.phase !== 'creating' || state.draft.creationIdempotencyKey !== key) return false
    state.phase = 'active'
    state.selectedConversationId = conversationId
    state.draft.conversationId = conversationId
    return true
  }

  function creationFailed(binding: ChannelBinding, key: string): void {
    const state = ensureState(binding)
    if (state.phase === 'creating' && state.draft.creationIdempotencyKey === key)
      state.phase = 'preparing'
  }

  function selectConversation(binding: ChannelBinding, conversationId: string): void {
    const state = ensureState(binding)
    state.phase = 'active'
    state.selectedConversationId = conversationId
    state.draft.conversationId = conversationId
  }

  function back(binding: ChannelBinding): void {
    const state = ensureState(binding)
    state.phase = 'index'
    state.selectedConversationId = null
  }

  function setListMode(binding: ChannelBinding, mode: AgentSessionListMode): void {
    ensureState(binding).listMode = mode
  }

  function setQuery(binding: ChannelBinding, query: string): void {
    ensureState(binding).query = query
  }

  function setScrollOffset(binding: ChannelBinding, offset: number): void {
    ensureState(binding).scrollOffset = Math.max(0, offset)
  }

  function updateDraft(
    binding: ChannelBinding,
    patch: Partial<
      Pick<
        AgentDrawerDraft,
        'runtimeId' | 'model' | 'permissionMode' | 'roleId' | 'text' | 'attachments'
      >
    >,
  ): void {
    const draft = ensureState(binding).draft
    if (patch.runtimeId !== undefined) draft.runtimeId = patch.runtimeId
    if (patch.model !== undefined) draft.model = patch.model
    if (patch.permissionMode !== undefined) draft.permissionMode = patch.permissionMode
    if (patch.roleId !== undefined) draft.roleId = patch.roleId
    if (patch.text !== undefined) draft.text = patch.text
    if (patch.attachments !== undefined) draft.attachments = patch.attachments.map(cloneAttachment)
  }

  function stageSource(binding: ChannelBinding, source: ChannelSourceInput): void {
    const sources = ensureState(binding).draft.sources
    if (!sources.some((value) => sameSource(value, source))) sources.push(structuredClone(source))
    if (sources.length > 20) sources.splice(0, sources.length - 20)
  }

  function removeSource(binding: ChannelBinding, messageClientId: string): void {
    const draft = ensureState(binding).draft
    draft.sources = draft.sources.filter(
      (source) => source.messageRef.messageClientId !== messageClientId,
    )
  }

  function consumeAcceptedInput(binding: ChannelBinding): void {
    const draft = ensureState(binding).draft
    draft.text = ''
    draft.attachments = []
    draft.sources = []
  }

  function cancelDraft(binding: ChannelBinding): void {
    const state = ensureState(binding)
    state.phase = 'index'
    state.selectedConversationId = null
    state.draft = createDraft(state.draft.runtimeId)
  }

  function clearBinding(binding: ChannelBinding): void {
    const key = serializeChannelBinding(binding)
    states.delete(key)
    if (activeKey.value === key) activeKey.value = null
  }

  function dispose(): void {
    states.clear()
    activeKey.value = null
  }

  function ensureState(binding: ChannelBinding): AgentDrawerChannelState {
    const key = serializeChannelBinding(binding)
    let state = states.get(key)
    if (!state) {
      state = {
        binding: structuredClone(binding),
        phase: 'index',
        listMode: 'recent',
        query: '',
        scrollOffset: 0,
        selectedConversationId: null,
        draft: createDraft(null),
      }
      states.set(key, state)
    }
    return state
  }

  return {
    states,
    activeKey,
    activeState,
    activateBinding,
    ensureState,
    prepare,
    beginCreation,
    completeCreation,
    creationFailed,
    selectConversation,
    back,
    setListMode,
    setQuery,
    setScrollOffset,
    updateDraft,
    stageSource,
    removeSource,
    consumeAcceptedInput,
    cancelDraft,
    clearBinding,
    dispose,
  }
})

function createDraft(runtimeId: string | null): AgentDrawerDraft {
  return {
    runtimeId,
    model: 'default',
    permissionMode: 'readOnly' as PermissionMode,
    roleId: null,
    text: '',
    attachments: [],
    sources: [],
    creationIdempotencyKey: crypto.randomUUID(),
    conversationId: null,
  }
}

function cloneAttachment(value: ComposerAttachment): ComposerAttachment {
  return { ...value }
}
