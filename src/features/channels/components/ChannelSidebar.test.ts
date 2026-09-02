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

  it('exposes accessible Slack-style conversation controls and status indicators', async () => {
    const channel: Channel = {
      ref: 'product',
      kind: 'group',
      name: 'Product',
      description: 'Product decisions',
      pinned: true,
      muted: true,
      unreadCount: 3,
      updatedAt: 2,
    }
    const wrapper = mountSidebar([channel], false)

    expect(wrapper.find('[data-channel-status="pinned"]').exists()).toBe(true)
    expect(wrapper.find('[data-channel-status="muted"]').exists()).toBe(true)
    await wrapper.get('[aria-label="Channel actions for Product"]').trigger('click')

    expect(wrapper.get('[role="menu"]').text()).toContain('Unpin conversation')
    expect(wrapper.get('[role="menu"]').text()).toContain('Unmute notifications')
    expect(wrapper.get('[role="menu"]').text()).toContain('Mark as read')
    expect(wrapper.get('[role="menu"]').text()).toContain('Hide conversation')

    const hide = wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text().includes('Hide conversation'))!
    await hide.trigger('click')
    expect(wrapper.emitted('hide')).toEqual([['product']])
  })
})
