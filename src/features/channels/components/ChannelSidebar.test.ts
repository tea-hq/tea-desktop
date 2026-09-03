// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, ChannelStatus, ChannelUserProfile } from '../contracts'
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
    expect(wrapper.get('.channel-row').find('img').exists()).toBe(false)
    expect(wrapper.get('.channel-row').text()).toContain('EN')
  })

  it('renders a cached IM profile avatar for direct conversations', () => {
    const direct: Channel = {
      ref: 'direct-account-b',
      kind: 'direct',
      participantAccountId: 'account-b',
      name: 'Account B',
      description: 'Direct conversation',
      unreadCount: 0,
      updatedAt: 1,
    }
    const profile: ChannelUserProfile = { accountId: 'account-b', name: 'Account B' }
    const wrapper = mount(ChannelSidebar, {
      props: {
        channels: [direct],
        activeRef: direct.ref,
        status: connectedStatus,
        loading: false,
        userProfiles: new Map([[profile.accountId, profile]]),
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.get('.channel-row img').attributes('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('does not wait for the profile request before generating a direct avatar', () => {
    const direct: Channel = {
      ref: 'direct-account-c',
      kind: 'direct',
      participantAccountId: 'account-c',
      name: 'Account C',
      description: 'Direct conversation',
      unreadCount: 0,
      updatedAt: 1,
    }
    const wrapper = mount(ChannelSidebar, {
      props: {
        channels: [direct],
        activeRef: direct.ref,
        status: connectedStatus,
        loading: false,
        userProfiles: new Map(),
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.get('.channel-row img').attributes('src')).toMatch(/^data:image\/svg\+xml/)
  })
})
