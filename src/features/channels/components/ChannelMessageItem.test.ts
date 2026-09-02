// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Message } from '../contracts'
import ChannelMessageItem from './ChannelMessageItem.vue'

const message: Message = {
  ref: { channelRef: 'channel-product', messageClientId: 'message-merged' },
  sender: { id: 'sender', name: 'Lin', isCurrentUser: false },
  sentAt: 1,
  text: 'Product history',
  content: {
    kind: 'merged',
    sourceChannelName: 'Product',
    abstracts: [
      {
        senderAccountId: 'sender',
        senderName: 'Lin',
        text: 'A long summary that must shrink inside a narrow timeline.',
      },
    ],
    depth: 1,
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}

describe('ChannelMessageItem', () => {
  it('allows merged message rows to shrink within narrow timelines', () => {
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
      },
    })

    expect(wrapper.get('.channel-message > div').classes()).toContain('min-w-0')
    expect(wrapper.get('.channel-message > div > div > .mt-1').classes()).toContain('max-w-full')
    expect(wrapper.get('[aria-label="Open chat history from Product"]').classes()).toContain(
      'max-w-full',
    )
  })
})
