// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import en from '@/locales/en'
import AgentSessionIndex from './AgentSessionIndex.vue'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt'],
  status: 'ready',
}
const alternateRuntime: RuntimeDescriptor = {
  ...runtime,
  id: 'external.codex',
  displayName: 'Codex',
}
const conversations = Array.from({ length: 10 }, (_, index) => ({
  conversationId: `conversation-${index}`,
  runtimeId: runtime.id,
  workspaceId: 'workspace',
  title: `Session ${index}`,
  lastMessagePreview: `Preview ${index}`,
  createdAt: index,
  updatedAt: index,
}))

function mountIndex(overrides: Record<string, unknown> = {}) {
  return mount(AgentSessionIndex, {
    props: {
      conversations,
      runtimes: [runtime],
      mode: 'recent',
      query: '',
      ...overrides,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('AgentSessionIndex', () => {
  it('uses an accessible icon action when history is empty', async () => {
    const wrapper = mountIndex({ conversations: [] })

    const create = wrapper.get('button[aria-label="New session"]')
    expect(create.attributes('title')).toBe('New session')
    expect(create.text()).toBe('')
    expect(wrapper.find('select').exists()).toBe(false)
    await create.trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('enables the default new action when a ready Agent exists', () => {
    const wrapper = mountIndex({ conversations: [] })

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('button[aria-label="New session"]').attributes('disabled')).toBeUndefined()
  })

  it('starts a new session with an explicitly chosen Agent', async () => {
    const wrapper = mountIndex({
      runtimes: [runtime, alternateRuntime],
      defaultRuntimeId: runtime.id,
    })

    await wrapper.get('button[aria-label="Choose another Agent"]').trigger('click')
    const codex = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Codex')
    expect(codex).toBeDefined()
    await codex!.trigger('click')

    expect(wrapper.emitted('createWithRuntime')).toEqual([['external.codex']])
  })

  it('limits recent sessions and exposes the full list intent', async () => {
    const wrapper = mountIndex()

    expect(wrapper.findAll('.session-row')).toHaveLength(8)
    const viewAll = wrapper.get('button[aria-label="View all sessions"]')
    expect(viewAll.attributes('title')).toBe('View all sessions')
    expect(viewAll.text()).toBe('')
    await viewAll.trigger('click')
    expect(wrapper.emitted('viewAll')).toHaveLength(1)
  })

  it('filters the complete list and forwards selection', async () => {
    const wrapper = mountIndex({ mode: 'all', query: 'Session 9' })

    expect(wrapper.findAll('.session-row')).toHaveLength(1)
    await wrapper.get('.session-row').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['conversation-9']])
  })

  it('shows opening feedback while keeping existing sessions visible', () => {
    const wrapper = mountIndex({ loading: true })

    const status = wrapper.get('[role="status"][aria-busy="true"]')
    expect(status.text()).toContain('Opening session…')
    expect(wrapper.findAll('.session-row')).toHaveLength(8)
    expect(wrapper.find('.session-row').attributes('disabled')).toBeDefined()
  })
})
