// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import ChannelMessageActions from './ChannelMessageActions.vue'

const activeConversation: ConversationSummary = {
  conversationId: 'conversation-1',
  runtimeId: 'runtime-1',
  workspaceId: 'workspace-1',
  title: 'Investigate the release',
  createdAt: 1,
  updatedAt: 2,
}

const runtime: RuntimeDescriptor = {
  id: 'runtime-1',
  kind: 'externalCli',
  displayName: 'Codex',
  capabilities: ['prompt'],
  status: 'ready',
}

function mountActions(
  options: {
    openUp?: boolean
    sentByCurrentUser?: boolean
    messageState?: 'active' | 'revoked'
    threadAvailable?: boolean
  } = {},
) {
  return mount(ChannelMessageActions, {
    props: {
      openUp: options.openUp ?? false,
      sentByCurrentUser: options.sentByCurrentUser ?? true,
      messageState: options.messageState ?? 'active',
      threadAvailable: options.threadAvailable ?? false,
      activeConversation,
      recentConversations: [],
      currentSessionAvailable: true,
      runtimes: [runtime],
      defaultRuntimeId: runtime.id,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

let wrapper: ReturnType<typeof mountActions> | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ChannelMessageActions', () => {
  it('exposes accessible quick actions and Agent entry points', async () => {
    wrapper = mountActions()

    expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Message actions')
    expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'Reply',
      'Forward',
      'Quick reaction',
      'Work with Agent',
      'More message actions',
    ])

    await wrapper.get('button[aria-label="Reply"]').trigger('click')
    expect(wrapper.emitted('action')).toEqual([['reply']])
  })

  it('forwards the selected message action and closes its menu', async () => {
    wrapper = mountActions({ openUp: true })

    const trigger = wrapper.get('button[aria-label="Work with Agent"]')
    await trigger.trigger('click')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    const menu = wrapper.get('[role="menu"]')
    expect(menu.attributes('aria-label')).toBe('Work with Agent')

    await menu.get('[role="menuitem"]').trigger('click')

    expect(wrapper.emitted('forwardToAgent')).toEqual([['current', undefined]])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('exposes the thread action only when the channel advertises threads', async () => {
    wrapper = mountActions({ threadAvailable: true })

    expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toContain(
      'Open thread',
    )
    await wrapper.get('button[aria-label="Open thread"]').trigger('click')
    expect(wrapper.emitted('action')).toEqual([['thread']])
  })

  it('groups destructive actions in the overflow menu for sent messages', async () => {
    wrapper = mountActions({ sentByCurrentUser: true })

    const trigger = wrapper.get('button[aria-label="More message actions"]')
    await trigger.trigger('click')

    const menu = wrapper.get('[role="menu"]')
    expect(menu.findAll('[role="menuitem"]').map((item) => item.text())).toEqual([
      'Reply',
      'Forward',
      'Select messages',
      'Quick reaction',
      'Edit message',
      'Pin message',
      'Save message',
      'Revoke message',
      'Delete message',
    ])
    expect(menu.findAll('[role="menuitem"]')[8]?.classes()).toContain('text-danger')

    await menu.findAll('[role="menuitem"]')[8]!.trigger('click')
    expect(wrapper.emitted('action')).toEqual([['delete']])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('omits revoke for received messages and leaves only delete after revocation', async () => {
    wrapper = mountActions({ sentByCurrentUser: false })
    await wrapper.get('button[aria-label="More message actions"]').trigger('click')
    expect(wrapper.get('[role="menu"]').text()).not.toContain('Revoke message')
    wrapper.unmount()

    wrapper = mountActions({ messageState: 'revoked' })
    expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'More message actions',
    ])
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[role="menu"]').text()).toBe('Delete message')
  })
})
