// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Channel, Message, MessageContent } from '../contracts'
import ChannelForwardDialog from './ChannelForwardDialog.vue'

const channels: Channel[] = [
  {
    ref: 'channel-product',
    kind: 'group',
    name: 'Product',
    description: 'Product decisions',
    unreadCount: 0,
    updatedAt: 2,
  },
  {
    ref: 'channel-alice',
    kind: 'direct',
    name: 'Alice',
    description: 'Direct message',
    unreadCount: 0,
    updatedAt: 1,
  },
]

function message(content: MessageContent, id: string): Message {
  return {
    ref: { channelRef: 'channel-source', messageClientId: id },
    sender: { id: 'sender', name: 'Lin', isCurrentUser: false },
    sentAt: 1,
    text: content.kind === 'text' ? content.text : 'Attachment',
    content,
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  }
}

function mountDialog(
  messages: Message[],
  initialMode: 'individual' | 'merged' = 'individual',
  targetChannels = channels,
) {
  return mount(ChannelForwardDialog, {
    props: { open: true, messages, channels: targetChannels, initialMode, pending: false },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelForwardDialog', () => {
  it('emits a merged forward intent for multiple targets with a trimmed comment', async () => {
    const messages = [
      message({ kind: 'text', text: 'First decision' }, 'message-1'),
      message({ kind: 'text', text: 'Second decision' }, 'message-2'),
    ]
    const wrapper = mountDialog(messages, 'merged')
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!

    expect(dialog.textContent).toContain('2 messages selected')
    expect(dialog.textContent).toContain('First decision')
    expect(dialog.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      'Merge and forward',
    )

    for (const checkbox of dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      checkbox.click()
    }
    const textarea = dialog.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Comment (optional)"]',
    )!
    textarea.value = '  Please review  '
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()

    const confirm = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Forward',
    )!
    confirm.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('confirm')).toEqual([
      [
        {
          channelRefs: ['channel-product', 'channel-alice'],
          mode: 'merged',
          comment: 'Please review',
        },
      ],
    ])
    wrapper.unmount()
  })

  it('disables individual mode for content outside its forwarding whitelist', () => {
    const wrapper = mountDialog([message({ kind: 'audio', media: {} }, 'message-audio')])
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    const individual = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((button) => button.textContent?.includes('Forward individually'))!
    const merged = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (button) => button.textContent?.includes('Merge and forward'),
    )!

    expect(individual.disabled).toBe(true)
    expect(merged.getAttribute('aria-checked')).toBe('true')
    wrapper.unmount()
  })

  it('prevents selecting more than 50 target channels', async () => {
    const targetChannels = Array.from({ length: 51 }, (_, index): Channel => ({
      ref: `channel-${index}`,
      kind: 'group',
      name: `Channel ${index}`,
      description: '',
      unreadCount: 0,
      updatedAt: index,
    }))
    const wrapper = mountDialog(
      [message({ kind: 'text', text: 'Decision' }, 'message-limit')],
      'individual',
      targetChannels,
    )
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    const checkboxes = dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')

    for (const checkbox of Array.from(checkboxes).slice(0, 50)) checkbox.click()
    checkboxes[50]!.click()
    await wrapper.vm.$nextTick()

    expect(dialog.textContent).toContain('50 of 50')
    expect(checkboxes[50]!.disabled).toBe(true)
    wrapper.unmount()
  })
})
