// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ConversationTurn } from '../contracts'
import ConversationTurnView from './ConversationTurn.vue'

function turn(text: string): ConversationTurn {
  return {
    id: 'turn-1',
    user: { id: 'message-1', text, attachments: [] },
    blocks: [],
    status: 'completed',
    lastEventSequence: 1,
  }
}

function mountTurn(value: ConversationTurn) {
  return mount(ConversationTurnView, {
    props: { turn: value },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ConversationTurn', () => {
  it('renders task notifications as left-side folded activity', () => {
    const wrapper = mountTurn(
      turn(`<task-notification>
<task-id>task-1</task-id>
<status>completed</status>
<summary>Background command "npm test" completed</summary>
<result>Tests passed.</result>
</task-notification>`),
    )

    expect(wrapper.find('.conversation-user').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-notification-fold"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('<task-notification>')
    expect(wrapper.text()).toContain('Background command "npm test" completed')
  })

  it('keeps ordinary user messages in the user bubble', () => {
    const wrapper = mountTurn(turn('Please inspect the build output.'))

    expect(wrapper.find('.conversation-user').exists()).toBe(true)
    expect(wrapper.find('.conversation-response__content').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-notification-fold"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Please inspect the build output.')
  })

  it('scopes compact reply typography to assistant content', () => {
    const value = turn('Please inspect the build output.')
    value.blocks = [
      {
        kind: 'assistantText',
        id: 'reply-1',
        sequence: 2,
        text: 'The build output is clean.',
        streaming: false,
      },
    ]

    const wrapper = mountTurn(value)

    expect(wrapper.find('.conversation-response__content').exists()).toBe(true)
    expect(wrapper.get('.conversation-user').classes()).toContain('text-sm')
  })
})
