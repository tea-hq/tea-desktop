// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import ChannelPresenceIndicator from './ChannelPresenceIndicator.vue'

describe('ChannelPresenceIndicator', () => {
  it.each([
    ['online', 'Online'],
    ['offline', 'Offline'],
    ['unknown', 'Availability unknown'],
  ] as const)('renders stable accessible %s availability', (availability, label) => {
    const wrapper = mount(ChannelPresenceIndicator, {
      props: { availability, size: 'avatar' },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    expect(wrapper.attributes('data-channel-presence')).toBe(availability)
    expect(wrapper.attributes('aria-label')).toBe(label)
    expect(wrapper.classes()).toContain('channel-presence-indicator--avatar')
  })

  it('localizes the accessible label without changing the visual state', () => {
    const wrapper = mount(ChannelPresenceIndicator, {
      props: { availability: 'online', size: 'inline' },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: { en, 'zh-CN': zhCN } })],
      },
    })

    expect(wrapper.attributes('aria-label')).toBe('在线')
    expect(wrapper.classes()).toContain('channel-presence-indicator--inline')
  })
})
