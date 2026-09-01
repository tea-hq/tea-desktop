// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
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
    expect(wrapper.findAll('.workspace-group__label')).toHaveLength(2)
    expect(wrapper.findAll('.workspace-group__label').map((label) => label.text())).toEqual([
      'Projects',
      'Recent conversations',
    ])
    expect(wrapper.findAll('.workspace-group__header .workspace-group__chevron')).toHaveLength(2)
    expect(wrapper.get('.conversation-filters__list').classes()).toContain('nav-pill-group')
    expect(wrapper.findAll('.conversation-filter.nav-pill-group__item')).toHaveLength(3)
    expect(wrapper.get('.conversation-filter[aria-selected="true"]').classes()).toContain(
      'nav-pill-group__item',
    )
    expect(wrapper.find('.workspace-group__header .i-mdi-clock-outline').exists()).toBe(false)
    expect(wrapper.find('.workspace-group__header .i-mdi-folder-multiple-outline').exists()).toBe(
      false,
    )
    expect(wrapper.findAll('.workspace-project__header .workspace-group__chevron')).toHaveLength(0)
    expect(wrapper.findAll('.conversation-row__context')).toHaveLength(3)
    expect(wrapper.findAll('.conversation-row__runtime')).toHaveLength(3)
    expect(wrapper.findAll('.conversation-row.min-h-9')).toHaveLength(3)
    expect(wrapper.findAll('.conversation-row--recent')).toHaveLength(1)
    expect(wrapper.findAll('.conversation-row--project')).toHaveLength(2)
    expect(wrapper.findAll('.conversation-row__select.px-2')).toHaveLength(0)

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

  it('quick-creates project and recent conversations with distinct directory context', async () => {
    const wrapper = mountSidebar([
      summary('Recent', 'workspace-recent'),
      summary('Project', 'workspace-project', '/projects/alpha'),
    ])

    const projectToggle = wrapper.get('.workspace-project__header')
    await wrapper.get('button[aria-label="New conversation in alpha"]').trigger('click')
    expect(projectToggle.attributes('aria-expanded')).toBe('true')

    const recentToggle = wrapper.findAll('.workspace-group__header')[1]!
    await wrapper.get('button[aria-label="New conversation without a project"]').trigger('click')
    expect(recentToggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.emitted('quickCreate')).toEqual([['/projects/alpha'], [null]])
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
    expect(
      wrapper
        .find('.conversation-row__activity .conversation-activity-indicator--running')
        .exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('.conversation-row__activity .conversation-activity-indicator--completed')
        .exists(),
    ).toBe(true)
    expect(
      wrapper.find('.conversation-row__select .conversation-activity-indicator').exists(),
    ).toBe(false)
  })

  it('offers only archive from each conversation item', async () => {
    const wrapper = mountSidebar([summary('Archive me', 'workspace-archive')])

    await wrapper.get('button[aria-label="Conversation actions"]').trigger('click')
    const menuItems = wrapper.findAll('[role="menuitem"]')
    expect(menuItems.map((item) => item.text())).toEqual(['Archive conversation'])

    await menuItems[0]!.trigger('click')
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Archive "Archive me"?')
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Archive',
    )
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('archive')).toEqual([['Archive me']])
  })

  it('swaps channel metadata and actions in one fixed action slot', () => {
    const wrapper = mountSidebar([
      {
        ...summary('Channel session', 'workspace-channel'),
        channelBinding: {
          transportId: 'fixture.im',
          accountRef: 'account-1',
          channelRef: 'product',
        },
      },
    ])

    const context = wrapper.get('.conversation-row__context')
    expect(context.find('.conversation-row__runtime').exists()).toBe(true)
    expect(context.find('.conversation-row__channel').exists()).toBe(false)

    const actionSlot = wrapper.get('.conversation-row__action-slot')
    expect(actionSlot.find('.conversation-row__channel').exists()).toBe(true)
    expect(actionSlot.find('.conversation-row__menu').exists()).toBe(true)
  })

  it('highlights exactly the active session across sidebar groups', async () => {
    const wrapper = mountSidebar([
      summary('Recent', 'workspace-recent'),
      summary('Project', 'workspace-project', '/projects/alpha'),
    ])

    let rows = wrapper.findAll('.conversation-row')
    expect(rows[0]?.classes()).not.toContain('conversation-row--active')
    expect(rows[0]?.attributes('aria-current')).toBeUndefined()
    expect(rows[1]?.classes()).toContain('conversation-row--active')
    expect(rows[1]?.attributes('aria-current')).toBe('page')

    await wrapper.setProps({ activeId: 'Project' })
    rows = wrapper.findAll('.conversation-row')
    expect(rows[0]?.classes()).toContain('conversation-row--active')
    expect(rows[0]?.attributes('aria-current')).toBe('page')
    expect(rows[1]?.classes()).not.toContain('conversation-row--active')
    expect(rows[1]?.attributes('aria-current')).toBeUndefined()
    expect(rows[0]?.classes()).toContain('rounded-control')
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
    expect(wrapper.findAll('.conversation-row')).toHaveLength(1)

    await groupHeaders[1]!.trigger('click')
    expect(groupHeaders[1]?.attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('.conversation-row')).toHaveLength(0)

    await groupHeaders[0]!.trigger('click')
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
