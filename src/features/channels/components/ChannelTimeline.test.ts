// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, Message } from '../contracts'
import { createTextMessageContent } from '../messageContent'
import { messageSelectionKey } from '../useChannelMessageSelection'
import ChannelTimeline from './ChannelTimeline.vue'

const channel: Channel = {
  ref: 'channel-product',
  kind: 'group',
  name: 'Product',
  description: 'Product decisions',
  unreadCount: 0,
  updatedAt: 1,
}

const selectedMessage: Message = {
  ref: { channelRef: channel.ref, messageClientId: 'message-1' },
  sender: { id: 'sender', name: 'Lin', isCurrentUser: false },
  sentAt: 1,
  text: 'Decision',
  content: createTextMessageContent('Decision'),
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelTimeline selection mode', () => {
  it('renders stable selection controls and emits forwarding intents', async () => {
    const wrapper = mount(ChannelTimeline, {
      props: {
        channel,
        messages: [selectedMessage],
        panelOpen: false,
        loading: false,
        hasMore: false,
        sending: false,
        activeConversation: null,
        recentConversations: [],
        currentSessionAvailable: false,
        runtimes: [],
        defaultRuntimeId: null,
        selectionMode: true,
        selectedMessageKeys: [messageSelectionKey(selectedMessage)],
        selectedCount: 1,
        canForwardIndividual: true,
        canForwardMerged: false,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    const checkbox = wrapper.get<HTMLInputElement>('input[type="checkbox"]')
    expect(checkbox.element.checked).toBe(true)
    expect(wrapper.text()).toContain('1 of 100 selected')

    const button = (label: string) =>
      wrapper.findAll('button').find((candidate) => candidate.text().trim() === label)!
    expect(button('Merge and forward').attributes('disabled')).toBeDefined()

    await checkbox.trigger('change')
    await wrapper.get('button[aria-label="Cancel selection"]').trigger('click')
    await button('Select visible').trigger('click')
    await button('Forward individually').trigger('click')

    expect(wrapper.emitted('toggleMessageSelection')).toEqual([[selectedMessage]])
    expect(wrapper.emitted('cancelSelection')).toEqual([[]])
    expect(wrapper.emitted('selectAllVisible')).toEqual([[]])
    expect(wrapper.emitted('forwardSelection')).toEqual([['individual']])
    wrapper.unmount()
  })

  it('treats a merged card as selectable content instead of opening it', async () => {
    const mergedMessage: Message = {
      ...selectedMessage,
      ref: { channelRef: channel.ref, messageClientId: 'message-merged' },
      text: 'Product history',
      content: {
        kind: 'merged',
        sourceChannelName: 'Product',
        abstracts: [],
        depth: 1,
      },
    }
    const wrapper = mount(ChannelTimeline, {
      props: {
        channel,
        messages: [mergedMessage],
        panelOpen: false,
        loading: false,
        hasMore: false,
        sending: false,
        activeConversation: null,
        recentConversations: [],
        currentSessionAvailable: false,
        runtimes: [],
        defaultRuntimeId: null,
        selectionMode: true,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.find('button[aria-label="Open chat history from Product"]').exists()).toBe(false)
    await wrapper.get('.channel-message .rounded-card').trigger('click')

    expect(wrapper.emitted('toggleMessageSelection')).toEqual([[mergedMessage]])
    expect(wrapper.emitted('openMerged')).toBeUndefined()
    wrapper.unmount()
  })
})
