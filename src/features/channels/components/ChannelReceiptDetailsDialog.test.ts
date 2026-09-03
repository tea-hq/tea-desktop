// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import ChannelReceiptDetailsDialog from './ChannelReceiptDetailsDialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChannelReceiptDetailsDialog', () => {
  it('switches between localized read and unread member lists', async () => {
    const wrapper = mount(ChannelReceiptDetailsDialog, {
      props: {
        open: true,
        loading: false,
        errorCode: null,
        details: {
          messageRef: { channelRef: 'team', messageClientId: 'message-1' },
          read: [{ id: 'lin', name: '林晓', isCurrentUser: false }],
          unread: [{ id: 'yu', name: '余舟', isCurrentUser: false }],
          readCount: 1,
          unreadCount: 1,
        },
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

    expect(dialog.textContent).toContain('林晓')
    const unreadTab = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (button) => button.textContent?.includes('未读 1'),
    )!
    unreadTab.click()
    await wrapper.vm.$nextTick()

    expect(dialog.textContent).toContain('余舟')
    expect(dialog.querySelector('button[aria-label="关闭"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('keeps the retry path available after a stable transport error', async () => {
    const wrapper = mount(ChannelReceiptDetailsDialog, {
      props: { open: true, loading: false, errorCode: 'timeout', details: null },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    const retry = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Try again',
    )!

    retry.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('retry')).toEqual([[]])
    wrapper.unmount()
  })
})
