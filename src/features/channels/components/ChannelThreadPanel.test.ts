// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, ChannelThread, Message } from '../contracts'
import { createTextMessageContent } from '../messageContent'
import ChannelThreadPanel from './ChannelThreadPanel.vue'

const channel: Channel = {
  ref: 'product-collab',
  kind: 'group',
  name: 'Product collaboration',
  description: 'Design decisions',
  memberCount: 4,
  pinned: false,
  muted: false,
  unreadCount: 0,
  updatedAt: 2,
}

const root: Message = {
  ref: { channelRef: channel.ref, messageClientId: 'root-1' },
  sender: { id: 'lin', name: 'Lin', isCurrentUser: false },
  sentAt: 1,
  text: 'Keep the decision in the channel thread.',
  content: createTextMessageContent('Keep the decision in the channel thread.'),
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}

const reply: Message = {
  ref: { channelRef: channel.ref, messageClientId: 'reply-1' },
  sender: { id: 'me', name: 'Me', isCurrentUser: true },
  sentAt: 2,
  text: 'Agreed.',
  content: createTextMessageContent('Agreed.'),
  replyTo: { ref: root.ref, senderName: root.sender.name, text: root.text },
  state: 'active',
  sentByCurrentUser: true,
  pinned: false,
  reactions: [],
}

const thread: ChannelThread = {
  channelRef: channel.ref,
  root,
  replies: [reply],
  replyCount: 1,
  updatedAt: 2,
}

function mountPanel(props: Record<string, unknown>) {
  return mount(ChannelThreadPanel, {
    props: {
      channel,
      rootMessage: root,
      thread: null,
      loading: false,
      errorCode: null,
      ...props,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelThreadPanel', () => {
  it('renders the root, replies, and sends a typed thread reply', async () => {
    const wrapper = mountPanel({ thread })
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!

    expect(dialog.textContent).toContain('Original message')
    expect(dialog.textContent).toContain('Keep the decision in the channel thread.')
    expect(dialog.textContent).toContain('1 reply')
    expect(dialog.textContent).toContain('Agreed.')

    const textarea = dialog.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = 'A follow-up reply'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Send reply"]')!.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('send')).toEqual([['A follow-up reply']])
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close thread"]')!.click()
    expect(wrapper.emitted('close')).toEqual([[]])
    wrapper.unmount()
  })

  it('renders loading and retryable error states', async () => {
    const loadingWrapper = mountPanel({ loading: true })
    expect(document.body.textContent).toContain('Loading thread')
    loadingWrapper.unmount()
    document.body.innerHTML = ''

    const errorWrapper = mountPanel({ errorCode: 'transport' })
    const retry = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Retry thread"]',
    )
    expect(document.body.textContent).toContain('Could not load this thread (transport)')
    retry?.click()
    await errorWrapper.vm.$nextTick()
    expect(errorWrapper.emitted('retry')).toEqual([[]])
    errorWrapper.unmount()
  })
})
