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
      runtimeId: runtime.id,
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
  it('shows a Runtime-specific first action when history is empty', async () => {
    const wrapper = mountIndex({ conversations: [] })

    expect(wrapper.text()).toContain('New session with Claude Code')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('New session with Claude Code'))!
      .trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('limits recent sessions and exposes the full list intent', async () => {
    const wrapper = mountIndex()

    expect(wrapper.findAll('.session-row')).toHaveLength(8)
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('View all sessions'))!
      .trigger('click')
    expect(wrapper.emitted('viewAll')).toHaveLength(1)
  })

  it('filters the complete list and forwards selection', async () => {
    const wrapper = mountIndex({ mode: 'all', query: 'Session 9' })

    expect(wrapper.findAll('.session-row')).toHaveLength(1)
    await wrapper.get('.session-row').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['conversation-9']])
  })
})
