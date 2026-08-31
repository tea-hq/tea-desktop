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

function summary(
  conversationId: string,
  workspaceId: string,
  workingDirectory?: string,
): ConversationSummary {
  return {
    conversationId,
    workspaceId,
    runtimeId: runtime.id,
    title: conversationId,
    ...(workingDirectory ? { workingDirectory } : {}),
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
  it('separates recent sessions from project sessions and keeps new conversation icon-only', async () => {
    const wrapper = mountSidebar([
      summary('Alpha review', 'workspace-alpha'),
      summary('Alpha build', 'workspace-alpha', '/projects/alpha'),
      summary('Beta review', 'workspace-beta', '/projects/beta'),
    ])

    expect(wrapper.findAll('.workspace-group')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-group__items')).toHaveLength(3)
    expect(wrapper.findAll('.workspace-project')).toHaveLength(2)
    expect(wrapper.findAll('.conversation-row')).toHaveLength(3)
    expect(wrapper.findAll('.workspace-group__count')).toHaveLength(0)
    expect(wrapper.findAll('.workspace-group__header .workspace-group__chevron')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-project__header .workspace-group__chevron')).toHaveLength(0)
    expect(wrapper.findAll('.conversation-row__context')).toHaveLength(3)
    expect(wrapper.findAll('.conversation-row__runtime')).toHaveLength(3)
    expect(wrapper.findAll('.conversation-row.min-h-9')).toHaveLength(3)
    expect(wrapper.findAll('.conversation-row--recent.pl-9')).toHaveLength(1)
    expect(wrapper.findAll('.conversation-row--project.pl-9')).toHaveLength(2)

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

  it('shows running and completed activity state for inactive sessions', () => {
    const wrapper = mount(ConversationSidebar, {
      props: {
        conversations: [summary('running', 'workspace-running'), summary('done', 'workspace-done')],
        activeId: 'running',
        runtimes: [runtime],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        filter: { kind: 'all' },
        runningConversationIds: new Set(['running']),
        completedConversationIds: new Set(['done']),
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.find('.conversation-activity-indicator--running').exists()).toBe(true)
    expect(wrapper.find('.conversation-activity-indicator--completed').exists()).toBe(true)
  })

  it('highlights exactly the active session across sidebar groups', async () => {
    const wrapper = mountSidebar([
      summary('Recent', 'workspace-recent'),
      summary('Project', 'workspace-project', '/projects/alpha'),
    ])

    let rows = wrapper.findAll('.conversation-row')
    expect(rows[0]?.classes()).toContain('conversation-row--active')
    expect(rows[0]?.attributes('aria-current')).toBe('page')
    expect(rows[1]?.classes()).not.toContain('conversation-row--active')
    expect(rows[1]?.attributes('aria-current')).toBeUndefined()

    await wrapper.setProps({ activeId: 'Project' })
    rows = wrapper.findAll('.conversation-row')
    expect(rows[0]?.classes()).not.toContain('conversation-row--active')
    expect(rows[0]?.attributes('aria-current')).toBeUndefined()
    expect(rows[1]?.classes()).toContain('conversation-row--active')
    expect(rows[1]?.attributes('aria-current')).toBe('page')
    expect(rows[1]?.classes()).toContain('rounded-control')
  })

  it('collapses recent, projects, and individual project sessions', async () => {
    const wrapper = mountSidebar([
      summary('Recent', 'workspace-recent'),
      summary('Alpha review', 'workspace-alpha', '/projects/alpha'),
      summary('Beta review', 'workspace-beta', '/projects/beta'),
    ])

    const groupHeaders = wrapper.findAll('.workspace-group__header')
    expect(groupHeaders).toHaveLength(2)
    expect(groupHeaders[0]?.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.conversation-row')).toHaveLength(3)

    await groupHeaders[0]!.trigger('click')
    expect(groupHeaders[0]?.attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('.conversation-row')).toHaveLength(2)

    await groupHeaders[1]!.trigger('click')
    expect(groupHeaders[1]?.attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('.conversation-row')).toHaveLength(0)

    await groupHeaders[1]!.trigger('click')
    const projectHeaders = wrapper.findAll('.workspace-project__header')
    expect(projectHeaders).toHaveLength(2)
    expect(projectHeaders[0]?.attributes('aria-expanded')).toBe('true')
    expect(projectHeaders[1]?.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.workspace-project__header .workspace-group__chevron')).toHaveLength(0)
    expect(wrapper.findAll('.conversation-row')).toHaveLength(2)

    await projectHeaders[0]!.trigger('click')
    expect(projectHeaders[0]?.attributes('aria-expanded')).toBe('false')
    expect(projectHeaders[1]?.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.conversation-row')).toHaveLength(1)

    await projectHeaders[0]!.trigger('click')
    expect(projectHeaders[0]?.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.conversation-row')).toHaveLength(2)
  })
})
