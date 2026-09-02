// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ChannelMediaSaveState } from '../contracts'
import ChannelMediaSaveControl from './ChannelMediaSaveControl.vue'

const messageRef = { channelRef: 'product', messageClientId: 'image-1' }

function state(overrides: Partial<ChannelMediaSaveState> = {}): ChannelMediaSaveState {
  return {
    operationId: 'media-save-1',
    messageRef,
    status: 'choosing',
    receivedBytes: 0,
    retryable: false,
    ...overrides,
  }
}

function mountControl(extraProps: Record<string, unknown> = {}) {
  return mount(ChannelMediaSaveControl, {
    props: { available: true, interactive: true, ...extraProps },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('ChannelMediaSaveControl', () => {
  it('emits save, cancel, and retry from stable icon controls', async () => {
    const wrapper = mountControl()
    await wrapper.get('button[aria-label="Save attachment"]').trigger('click')

    await wrapper.setProps({ state: state() })
    await wrapper.get('button[aria-label="Cancel attachment save"]').trigger('click')

    await wrapper.setProps({
      state: state({ status: 'failed', errorCode: 'downloadFailed', retryable: true }),
    })
    await wrapper.get('button[aria-label="Retry attachment save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([[]])
    expect(wrapper.emitted('cancel')).toEqual([[]])
    expect(wrapper.emitted('retry')).toEqual([[]])
  })

  it('announces bounded progress and disables non-retryable or unavailable actions', async () => {
    const wrapper = mountControl({
      state: state({ status: 'saving', receivedBytes: 75, totalBytes: 100 }),
    })
    expect(wrapper.get('[role="status"]').text()).toContain('75%')

    await wrapper.setProps({
      state: state({ status: 'failed', errorCode: 'tooLarge', retryable: false }),
    })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="status"]').text()).toContain('tooLarge')

    await wrapper.setProps({ state: null, available: false })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
