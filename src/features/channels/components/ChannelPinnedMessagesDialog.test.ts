// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import type { PinnedMessage } from '../contracts'
import { createTextMessageContent } from '../messageContent'
import ChannelPinnedMessagesDialog from './ChannelPinnedMessagesDialog.vue'

const pinnedAt = new Date(2026, 7, 27, 23, 4).getTime()
const item: PinnedMessage = {
  message: {
    ref: { channelRef: 'product', messageClientId: 'message-1' },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
    sentAt: pinnedAt - 60_000,
    text: 'Pinned decision',
    content: createTextMessageContent('Pinned decision'),
    state: 'active',
    sentByCurrentUser: false,
    pinned: true,
    reactions: [],
  },
  pinnedByAccountId: 'designer',
  pinnedAt,
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelPinnedMessagesDialog', () => {
  it('localizes dialog semantics and emits the selected pin', async () => {
    const wrapper = mount(ChannelPinnedMessagesDialog, {
      props: {
        open: true,
        channelName: 'Product design',
        items: [item],
        loading: false,
        errorCode: null,
      },
      global: {
        plugins: [
          createI18n({
            legacy: false,
            locale: 'zh-CN',
            messages: { en, 'zh-CN': zhCN },
          }),
        ],
      },
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.querySelector('button[aria-label="关闭"]')).not.toBeNull()
    expect(dialog.textContent).toContain('8月27日')
    expect(dialog.textContent).toContain('由 designer 置顶')

    const itemButton = Array.from(dialog.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Pinned decision'),
    )!
    itemButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select')).toEqual([[item]])
    wrapper.unmount()
  })
})
