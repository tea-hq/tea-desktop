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

function mountActions(openUp = false) {
  return mount(ChannelMessageActions, {
    props: {
      openUp,
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
  it('exposes a compact message-level toolbar with an accessible Agent action', () => {
    wrapper = mountActions()

    expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Message actions')
    const trigger = wrapper.get('button[aria-label="Work with Agent"]')
    expect(trigger.classes()).toContain('channel-message-actions__button')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('forwards the selected message action and closes its menu', async () => {
    wrapper = mountActions(true)

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
})
