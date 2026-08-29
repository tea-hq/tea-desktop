// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ToolCallBlock as ToolCall } from '../contracts'
import ToolCallBlock from './ToolCallBlock.vue'

const tool: ToolCall = {
  kind: 'toolCall',
  id: 'tool-1',
  sequence: 1,
  name: 'workspace.edit',
  status: 'completed',
  arguments: { path: 'src/App.vue', operation: 'replace' },
}

function mountTool(overrides: Partial<ToolCall> = {}) {
  return mount(ToolCallBlock, {
    props: { tool: { ...tool, ...overrides } },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ToolCallBlock', () => {
  it('renders an activity row and discloses arguments on demand', async () => {
    const wrapper = mountTool()

    expect(wrapper.get('.tool-event').classes()).toContain('tool-event--completed')
    expect(wrapper.get('.tool-event__icon').classes()).toContain('i-mdi-file-edit-outline')
    expect(wrapper.get('.tool-event__name').text()).toBe('workspace.edit')
    expect(wrapper.find('.tool-event__details').exists()).toBe(false)

    const disclosure = wrapper.get('.tool-event__disclosure')
    expect(disclosure.attributes('aria-label')).toBe('Show tool arguments')
    await disclosure.trigger('click')

    expect(wrapper.get('.tool-event__details').text()).toContain('src/App.vue')
    expect(disclosure.attributes('aria-expanded')).toBe('true')
    expect(disclosure.attributes('aria-label')).toBe('Hide tool arguments')
  })

  it('keeps approval content attached to the activity row', () => {
    const wrapper = mountTool({
      status: 'approvalRequired',
      approval: {
        id: 'approval-1',
        toolCallId: 'tool-1',
        toolName: 'workspace.edit',
        capabilities: ['write'],
        resources: ['src/App.vue'],
        decisions: ['allowOnce', 'deny'],
        status: 'pending',
      },
    })

    expect(wrapper.get('.tool-event').text()).toContain('Permission required')
    expect(wrapper.get('.tool-event__icon').classes()).toContain('i-mdi-file-edit-outline')
  })
})
