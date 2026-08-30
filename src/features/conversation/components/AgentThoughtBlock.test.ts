// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { AgentThoughtBlock as AgentThought } from '../contracts'
import AgentThoughtBlock from './AgentThoughtBlock.vue'

const thought: AgentThought = {
  kind: 'agentThought',
  id: 'thought-1',
  sequence: 1,
  text: 'Inspecting the recorded turn.',
  streaming: false,
  messageId: 'thought-1',
}

function mountThought() {
  return mount(AgentThoughtBlock, {
    props: { thought },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('AgentThoughtBlock', () => {
  it('keeps thought content collapsed behind a lightweight disclosure', async () => {
    const wrapper = mountThought()

    expect(wrapper.get('.agent-thought__label').text()).toBe('Agent thought')
    expect(wrapper.find('.agent-thought__details').exists()).toBe(false)

    const disclosure = wrapper.get('.agent-thought__disclosure')
    expect(disclosure.attributes('aria-label')).toBe('Show thought details')
    await disclosure.trigger('click')

    expect(wrapper.get('.agent-thought__details').text()).toContain('Inspecting the recorded turn.')
    expect(disclosure.attributes('aria-expanded')).toBe('true')
    expect(disclosure.attributes('aria-label')).toBe('Hide thought details')
  })
})
