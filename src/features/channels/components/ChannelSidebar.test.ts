// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, ChannelStatus } from '../contracts'
import ChannelSidebar from './ChannelSidebar.vue'

const connectedStatus: ChannelStatus = { phase: 'connected', retryable: true }

function mountSidebar(channels: Channel[], loading: boolean) {
  return mount(ChannelSidebar, {
    props: {
      channels,
      activeRef: null,
      status: connectedStatus,
      loading,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('ChannelSidebar', () => {
  it('shows a loading transition instead of the empty state while the catalog is pending', () => {
    const wrapper = mountSidebar([], true)

    expect(wrapper.get('[role="status"]').text()).toBe('Syncing conversations')
    expect(wrapper.findAll('.channel-row')).toHaveLength(6)
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('shows the empty state after a completed empty catalog response', () => {
    const wrapper = mountSidebar([], false)

    expect(wrapper.get('p').text()).toBe('No matching channels')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
