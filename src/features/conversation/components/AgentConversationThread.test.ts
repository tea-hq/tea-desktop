// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ConversationTurn } from '../contracts'
import AgentConversationThread from './AgentConversationThread.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const turn = (id: string): ConversationTurn => ({
  id,
  user: { id: `${id}-prompt`, text: `Prompt ${id}`, attachments: [] },
  blocks: [
    {
      kind: 'assistantText',
      id: `${id}-reply`,
      sequence: 1,
      text: `Reply ${id}`,
      streaming: false,
    },
  ],
  status: 'completed',
  lastEventSequence: 1,
})

function mountThread(overrides: Record<string, unknown> = {}) {
  return mount(AgentConversationThread, {
    props: {
      turns: [],
      loading: false,
      loadingOlder: false,
      hasOlder: false,
      ...overrides,
    },
    global: { plugins: [i18n] },
  })
}

function setScrollMetrics(
  element: HTMLElement,
  scrollHeight: number,
  scrollTop = 0,
): (value: number) => void {
  let height = scrollHeight
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => height,
  })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    },
  })
  return (value: number) => {
    height = value
  }
}

describe('AgentConversationThread', () => {
  it('scrolls to the latest turn when initial history finishes loading', async () => {
    const wrapper = mountThread({ loading: true })
    const element = wrapper.get('.agent-thread').element as HTMLElement
    setScrollMetrics(element, 900)

    await wrapper.setProps({ turns: [turn('latest')], loading: false })
    await wrapper.vm.$nextTick()

    expect(element.scrollTop).toBe(900)
  })

  it('scrolls to the latest turn when a loaded conversation is replaced', async () => {
    const wrapper = mountThread({ turns: [turn('previous')] })
    const element = wrapper.get('.agent-thread').element as HTMLElement
    setScrollMetrics(element, 900)

    await wrapper.setProps({ turns: [turn('latest')] })
    await wrapper.vm.$nextTick()

    expect(element.scrollTop).toBe(900)
  })

  it('keeps the current viewport when older history is prepended', async () => {
    const wrapper = mountThread({ turns: [turn('latest')], hasOlder: true })
    const element = wrapper.get('.agent-thread').element as HTMLElement
    const setScrollHeight = setScrollMetrics(element, 900, 240)

    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ loadingOlder: true })
    setScrollHeight(1_500)
    await wrapper.setProps({ turns: [turn('older'), turn('latest')] })
    await wrapper.setProps({ loadingOlder: false })
    await wrapper.vm.$nextTick()

    expect(element.scrollTop).toBe(840)
  })
})
