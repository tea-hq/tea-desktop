import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ChannelBinding, ChannelSourceInput } from '@/types/channelCollaboration'
import { serializeChannelBinding } from './agentDrawerContracts'
import { useAgentDrawerStore } from './agentDrawerStore'

const first: ChannelBinding = { transportId: 'mock', accountRef: 'account', channelRef: 'first' }
const second: ChannelBinding = { transportId: 'mock', accountRef: 'account', channelRef: 'second' }

describe('useAgentDrawerStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves through index, preparing, creating, active, and back', () => {
    const store = useAgentDrawerStore()
    store.activateBinding(first)
    store.prepare(first, 'external.claude')
    const key = store.beginCreation(first)!
    expect(store.completeCreation(first, key, 'conversation-1')).toBe(true)
    expect(store.ensureState(first).phase).toBe('active')
    store.back(first)
    expect(store.ensureState(first).phase).toBe('index')
  })

  it('restores independent draft and index navigation for each Channel', () => {
    const store = useAgentDrawerStore()
    store.prepare(first, 'external.claude')
    store.updateDraft(first, { text: 'first draft' })
    store.setListMode(first, 'all')
    store.setQuery(first, 'older')
    store.setScrollOffset(first, 120)
    store.prepare(second, 'external.codex')
    store.updateDraft(second, { text: 'second draft' })

    expect(store.ensureState(first)).toMatchObject({ listMode: 'all', query: 'older', scrollOffset: 120 })
    expect(store.ensureState(first).draft.text).toBe('first draft')
    expect(store.ensureState(second).draft.text).toBe('second draft')
    expect(store.states.has(serializeChannelBinding(first))).toBe(true)
  })

  it('rejects stale creation completion and deduplicates staged sources', () => {
    const store = useAgentDrawerStore()
    store.prepare(first, 'external.claude')
    const key = store.beginCreation(first)!
    store.cancelDraft(first)
    expect(store.completeCreation(first, key, 'stale')).toBe(false)

    const source: ChannelSourceInput = {
      messageRef: { channelRef: 'first', messageClientId: 'message-1' },
      senderName: 'Lin', sentAt: 1, sentByCurrentUser: false, text: 'Source', capturedAt: 2, state: 'active',
    }
    store.stageSource(first, source)
    store.stageSource(first, source)
    expect(store.ensureState(first).draft.sources).toHaveLength(1)
  })

  it('clears drafts only on explicit lifecycle intents', () => {
    const store = useAgentDrawerStore()
    store.prepare(first, 'external.claude')
    store.updateDraft(first, { text: 'keep me' })
    store.activateBinding(second)
    expect(store.ensureState(first).draft.text).toBe('keep me')
    store.clearBinding(first)
    expect(store.states.has(serializeChannelBinding(first))).toBe(false)
    store.dispose()
    expect(store.states.size).toBe(0)
  })
})
