// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { AgentThoughtBlock, ConversationTurnBlock, ToolCallBlock } from '../contracts'
import AgentActivityGroup from './AgentActivityGroup.vue'

const blocks: [AgentThoughtBlock, ToolCallBlock] = [
  {
    kind: 'agentThought',
    id: 'thought-1',
    sequence: 1,
    text: 'Inspecting the workspace.',
    streaming: false,
  },
  {
    kind: 'toolCall',
    id: 'tool-1',
    sequence: 2,
    name: 'read',
    status: 'completed',
    arguments: { path: 'src/App.vue' },
  },
]

type ActivityBlock = Extract<ConversationTurnBlock, { kind: 'agentThought' | 'toolCall' }>

function mountGroup(value: ActivityBlock[] = blocks) {
  return mount(AgentActivityGroup, {
    props: { blocks: value },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('AgentActivityGroup', () => {
  it('collapses consecutive activity blocks into one summary row', async () => {
    const wrapper = mountGroup()

    expect(wrapper.get('.agent-activity__label').text()).toBe('2 activity steps')
    expect(wrapper.find('.agent-thought').exists()).toBe(false)
    expect(wrapper.find('.tool-event').exists()).toBe(false)

    await wrapper.get('.agent-activity__disclosure').trigger('click')

    expect(wrapper.find('.agent-thought').exists()).toBe(true)
    expect(wrapper.find('.tool-event').exists()).toBe(true)
  })

  it('keeps an approval request visible by expanding the activity group', () => {
    const wrapper = mountGroup([
      {
        ...blocks[1],
        status: 'approvalRequired',
        approval: {
          id: 'approval-1',
          toolCallId: 'tool-1',
          toolName: 'read',
          capabilities: ['filesystem.read'],
          resources: ['src/App.vue'],
          decisions: ['allowOnce'],
          status: 'pending',
        },
      },
    ])

    expect(wrapper.get('.agent-activity__disclosure').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[aria-label="Permission required"]').exists()).toBe(true)
  })
})
