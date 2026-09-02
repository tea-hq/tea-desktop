// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, Message, MessageMention, OutgoingMessageAttempt } from '../contracts'
import { createTextMessageContent } from '../messageContent'
import { messageSelectionKey } from '../useChannelMessageSelection'
import ChannelTimeline from './ChannelTimeline.vue'

const channel: Channel = {
  ref: 'channel-product',
  kind: 'group',
  name: 'Product',
  description: 'Product decisions',
  pinned: false,
  muted: false,
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

  it('selects a mention with the keyboard and emits structured metadata', async () => {
    const wrapper = mount(ChannelTimeline, {
      props: {
        channel,
        messages: [],
        panelOpen: false,
        loading: false,
        hasMore: false,
        activeConversation: null,
        recentConversations: [],
        currentSessionAvailable: false,
        runtimes: [],
        defaultRuntimeId: null,
        mentionMembers: [
          {
            accountId: 'lin',
            name: 'Lin',
            role: 'member',
            chatBanned: false,
          },
        ],
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const textarea = wrapper.get('textarea')

    await textarea.setValue('@li')
    expect(wrapper.emitted('updateDraft')?.at(-1)).toEqual([{ text: '@li', mentions: [] }])
    await wrapper.setProps({ draft: '@li' })
    expect(wrapper.emitted('requestMentionMembers')).toEqual([[]])
    await textarea.trigger('keydown', { key: 'Enter' })
    const selectedDraft = wrapper.emitted('updateDraft')?.at(-1)?.[0] as {
      text: string
      mentions: MessageMention[]
    }
    await wrapper.setProps({ draft: selectedDraft.text, draftMentions: selectedDraft.mentions })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('@Lin ')

    await textarea.setValue('@Lin review this')
    const completedDraft = wrapper.emitted('updateDraft')?.at(-1)?.[0] as {
      text: string
      mentions: NonNullable<Message['mentions']>
    }
    await wrapper.setProps({
      draft: completedDraft.text,
      draftMentions: completedDraft.mentions,
    })
    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(wrapper.emitted('send')).toEqual([
      [
        {
          text: '@Lin review this',
          replyTo: null,
          attachments: [],
          mentions: [
            {
              target: { kind: 'user', accountId: 'lin' },
              label: '@Lin',
              ranges: [{ start: 0, end: 4 }],
            },
          ],
        },
      ],
    ])
    expect((textarea.element as HTMLTextAreaElement).value).toBe('@Lin review this')
    wrapper.unmount()
  })

  it('renders an accessible local draft persistence error', () => {
    const wrapper = mount(ChannelTimeline, {
      props: {
        channel,
        messages: [],
        panelOpen: false,
        loading: false,
        hasMore: false,
        activeConversation: null,
        recentConversations: [],
        currentSessionAvailable: false,
        runtimes: [],
        defaultRuntimeId: null,
        draft: 'Keep this',
        draftErrorCode: 'storageFailure',
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('storageFailure')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Keep this')
  })

  it('opens receipt details from an outgoing group message summary', async () => {
    const outgoing: Message = {
      ...selectedMessage,
      sender: { id: 'me', name: 'Me', isCurrentUser: true },
      sentByCurrentUser: true,
      receipt: { readCount: 2, unreadCount: 1 },
    }
    const wrapper = mount(ChannelTimeline, {
      props: {
        channel,
        messages: [outgoing],
        panelOpen: false,
        loading: false,
        hasMore: false,
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

    const receipt = wrapper
      .findAll('button')
      .find((candidate) => candidate.text().includes('2 read · 1 unread'))!
    await receipt.trigger('click')

    expect(wrapper.emitted('openReceiptDetails')).toEqual([[outgoing]])
    wrapper.unmount()
  })

  it('renders outgoing attempts and forwards delivery intents', async () => {
    const outgoing: OutgoingMessageAttempt = {
      attemptId: 'attempt-1',
      idempotencyKey: 'im-send:v1:one',
      operationId: 'operation-1',
      channelRef: channel.ref,
      content: { kind: 'text', text: 'Retry this' },
      mentions: [],
      createdAt: 2,
      status: 'failed',
      progress: 0,
      attemptNumber: 1,
      retryable: true,
      errorCode: 'transport',
    }
    const wrapper = mount(ChannelTimeline, {
      props: {
        channel,
        messages: [],
        outgoingAttempts: [outgoing],
        panelOpen: false,
        loading: false,
        hasMore: false,
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

    expect(wrapper.find('[data-outgoing-attempt-id="attempt-1"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('No messages yet')
    await wrapper.get('button[aria-label="Retry send"]').trigger('click')
    await wrapper.get('button[aria-label="Dismiss unsent message"]').trigger('click')

    expect(wrapper.emitted('retryOutgoing')).toEqual([['attempt-1']])
    expect(wrapper.emitted('dismissOutgoing')).toEqual([['attempt-1']])
  })
})
