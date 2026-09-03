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

const channelFixtures: Channel[] = [
  {
    ref: 'product',
    kind: 'group',
    name: 'Product design',
    description: 'Desktop Agent experience',
    unreadCount: 0,
    updatedAt: 1,
  },
  {
    ref: 'engineering',
    kind: 'group',
    name: 'Engineering',
    description: 'Implementation coordination',
    unreadCount: 0,
    updatedAt: 1,
  },
]

describe('ChannelSidebar', () => {
  it('shows a loading transition instead of the empty state while the catalog is pending', () => {
    const wrapper = mountSidebar([], true)

    expect(wrapper.get('[role="status"]').text()).toBe('Syncing conversations')
    expect(wrapper.get('aside').attributes('aria-label')).toBe('Channels')
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.findAll('.channel-row')).toHaveLength(6)
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('shows the empty state after a completed empty catalog response', () => {
    const wrapper = mountSidebar([], false)

    expect(wrapper.get('p').text()).toBe('No matching channels')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('uses the shell query without rendering a second sidebar search field', () => {
    const wrapper = mount(ChannelSidebar, {
      props: {
        channels: channelFixtures,
        activeRef: null,
        status: connectedStatus,
        loading: false,
        searchQuery: 'engineering',
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findAll('.channel-row')).toHaveLength(1)
    expect(wrapper.get('.channel-row').text()).toContain('Engineering')
  })
})
