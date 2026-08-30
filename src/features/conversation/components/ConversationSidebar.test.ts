// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ConversationSummary, RuntimeDescriptor } from '../contracts'
import ConversationSidebar from './ConversationSidebar.vue'

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

function summary(conversationId: string, workspaceId: string): ConversationSummary {
  return {
    conversationId,
    workspaceId,
    runtimeId: runtime.id,
    title: conversationId,
    createdAt: 1,
    updatedAt: 1,
  }
}

function mountSidebar(conversations: ConversationSummary[]) {
  return mount(ConversationSidebar, {
    props: {
      conversations,
      activeId: conversations[0]?.conversationId ?? null,
      runtimes: [runtime],
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: false,
      filter: { kind: 'all' },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ConversationSidebar', () => {
  it('groups sessions by workspace and keeps new conversation icon-only', async () => {
    const wrapper = mountSidebar([
      summary('Alpha review', 'workspace-alpha'),
      summary('Alpha build', 'workspace-alpha'),
      summary('Beta review', 'workspace-beta'),
    ])

    expect(wrapper.findAll('.workspace-group')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-group__items')).toHaveLength(2)
    expect(wrapper.findAll('.conversation-row')).toHaveLength(3)

    const newButton = wrapper.get('button[aria-label="New Conversation"]')
    expect(newButton.text()).toBe('')
    await newButton.trigger('click')
    expect(wrapper.emitted('new')).toHaveLength(1)
  })

  it('offers alternate Agents from the same lightweight menu', async () => {
    const wrapper = mount(ConversationSidebar, {
      props: {
        conversations: [],
        activeId: null,
        runtimes: [runtime, alternateRuntime],
        defaultRuntimeId: runtime.id,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        filter: { kind: 'all' },
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    await wrapper.get('button[aria-label="Choose another Agent"]').trigger('click')
    const codex = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Codex')
    expect(codex).toBeDefined()
    await codex!.trigger('click')

    expect(wrapper.emitted('newWithRuntime')).toEqual([['external.codex']])
  })
})
