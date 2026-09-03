// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Message } from '../contracts'
import ChannelMessageItem from './ChannelMessageItem.vue'

const message: Message = {
  ref: { channelRef: 'product', messageClientId: 'm1' },
  sender: { id: 'user-1', name: 'Ada Lovelace', isCurrentUser: false },
  sentAt: 1,
  text: 'Hello',
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}

describe('ChannelMessageItem', () => {
  it('renders a deterministic Avataaars fallback for senders without an avatar', () => {
    const wrapper = mount(ChannelMessageItem, {
      props: {
        message,
        menuOpenUp: false,
        activeConversation: null,
        recentConversations: [],
        currentSessionAvailable: false,
        runtimes: [],
        defaultRuntimeId: null,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
        stubs: {
          ChannelMessageActions: true,
          MarkdownContent: true,
        },
      },
    })

    expect(wrapper.get('img').attributes('src')).toMatch(/^data:image\/svg\+xml/)
  })
})
