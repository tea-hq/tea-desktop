// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, ChannelDraft, ChannelPresence, ChannelStatus } from '../contracts'
import ChannelSidebar from './ChannelSidebar.vue'

const connectedStatus: ChannelStatus = { phase: 'connected', retryable: true }

function mountSidebar(
  channels: Channel[],
  loading: boolean,
  drafts: ChannelDraft[] = [],
  presences: ChannelPresence[] = [],
) {
  return mount(ChannelSidebar, {
    props: {
      channels,
      activeRef: null,
      status: connectedStatus,
      loading,
      drafts,
      presences,
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

  it('replaces the message preview with a localized draft projection', () => {
    const channel: Channel = {
      ref: 'product',
      kind: 'group',
      name: 'Product',
      description: 'Product decisions',
      pinned: false,
      muted: false,
      unreadCount: 0,
      updatedAt: 2,
      lastMessagePreview: 'Last delivered message',
    }
    const draft: ChannelDraft = {
      accountRef: 'account',
      channelRef: channel.ref,
      text: '  Review the release notes  ',
      mentions: [],
      updatedAt: 3,
    }
    const wrapper = mountSidebar([channel], false, [draft])

    expect(wrapper.get('.channel-row__preview').text()).toContain('Draft')
    expect(wrapper.get('.channel-row__preview').text()).toContain('Review the release notes')
    expect(wrapper.text()).not.toContain('Last delivered message')
  })

  it('overlays availability on direct avatars without marking groups', () => {
    const direct: Channel = {
      ref: 'lin-direct',
      kind: 'direct',
      directAccountId: 'lin',
      name: 'Lin',
      description: 'Product design',
      pinned: false,
      muted: false,
      unreadCount: 0,
      updatedAt: 2,
    }
    const group: Channel = {
      ...direct,
      ref: 'product',
      kind: 'group',
      directAccountId: undefined,
      name: 'Product',
    }
    const wrapper = mountSidebar(
      [direct, group],
      false,
      [],
      [{ accountId: 'lin', availability: 'online', updatedAt: 3 }],
    )
    const rows = wrapper.findAll('.channel-row')

    expect(rows[0]!.get('[data-channel-presence="online"]').attributes('aria-label')).toBe('Online')
    expect(rows[1]!.find('[data-channel-presence]').exists()).toBe(false)
  })
})
