// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { Message, MessageContent } from '../contracts'
import ChannelMergedMessagesDialog from './ChannelMergedMessagesDialog.vue'

function message(content: MessageContent, id: string): Message {
  return {
    ref: { channelRef: 'channel-source', messageClientId: id },
    sender: { id: 'sender', name: 'Lin', isCurrentUser: false },
    sentAt: 1,
    text: content.kind === 'text' ? content.text : 'Chat history',
    content,
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  }
}

const parent = message(
  {
    kind: 'merged',
    sourceChannelName: 'Product',
    abstracts: [{ senderAccountId: 'sender', senderName: 'Lin', text: 'Decision' }],
    depth: 1,
  },
  'merged-parent',
)

function mountDialog(
  overrides: {
    items?: Message[]
    loading?: boolean
    errorCode?: string | null
    canGoBack?: boolean
  } = {},
) {
  return mount(ChannelMergedMessagesDialog, {
    props: {
      open: true,
      message: parent,
      items: overrides.items ?? [],
      loading: overrides.loading ?? false,
      errorCode: overrides.errorCode ?? null,
      canGoBack: overrides.canGoBack ?? false,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelMergedMessagesDialog', () => {
  it('renders loading and recoverable error states', async () => {
    const wrapper = mountDialog({ loading: true })
    let dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain('Loading chat history')

    await wrapper.setProps({ loading: false, errorCode: 'archive_checksum_mismatch' })
    dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
      'archive_checksum_mismatch',
    )
    const retry = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Retry',
    )!
    retry.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('retry')).toEqual([[]])
    wrapper.unmount()
  })

  it('renders archived messages without actions and emits nested navigation intents', async () => {
    const nested = message(
      { kind: 'merged', sourceChannelName: 'Design', abstracts: [], depth: 2 },
      'merged-nested',
    )
    const wrapper = mountDialog({
      items: [message({ kind: 'text', text: 'Archived decision' }, 'archived-text'), nested],
      canGoBack: true,
    })
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!

    expect(dialog.textContent).toContain('Archived decision')
    expect(dialog.querySelector('[role="toolbar"]')).toBeNull()
    dialog
      .querySelector<HTMLButtonElement>('button[aria-label="Open chat history from Design"]')!
      .click()
    const back = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Previous history'),
    )!
    back.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('openMerged')).toEqual([[nested]])
    expect(wrapper.emitted('back')).toEqual([[]])
    wrapper.unmount()
  })
})
