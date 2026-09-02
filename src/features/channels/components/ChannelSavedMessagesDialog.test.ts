// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import type { SavedMessage } from '../contracts'
import { createTextMessageContent } from '../messageContent'
import ChannelSavedMessagesDialog from './ChannelSavedMessagesDialog.vue'

const item: SavedMessage = {
  id: 'saved-1',
  message: {
    ref: { channelRef: 'product', messageClientId: 'message-1' },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
    sentAt: new Date(2026, 7, 27, 23, 3).getTime(),
    text: 'Saved decision',
    content: createTextMessageContent('Saved decision'),
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  },
  sourceChannelName: 'Product design',
  savedAt: new Date(2026, 7, 27, 23, 4).getTime(),
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelSavedMessagesDialog', () => {
  it('renders a localized catalog and emits tool intents', async () => {
    const wrapper = mount(ChannelSavedMessagesDialog, {
      props: {
        open: true,
        items: [item],
        totalCount: 1,
        loading: false,
        loadingMore: false,
        hasMore: true,
        errorCode: null,
        removingId: null,
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
    expect(dialog.textContent).toContain('Product design')
    expect(dialog.textContent).toContain('8月27日')
    expect(dialog.querySelector('button[aria-label="关闭"]')).not.toBeNull()

    dialog.querySelector<HTMLButtonElement>('button[aria-label="交给当前 Agent 处理"]')!.click()
    dialog.querySelector<HTMLButtonElement>('button[aria-label="移出收藏"]')!.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('stageAgent')).toEqual([[item]])
    expect(wrapper.emitted('remove')).toEqual([[item]])
    wrapper.unmount()
  })
})
