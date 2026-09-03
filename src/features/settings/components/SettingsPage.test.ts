// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import SettingsPage from './SettingsPage.vue'

function mountPage(locale: 'en' | 'zh-CN' = 'en', overrides: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale, messages: { en, 'zh-CN': zhCN } })
  return mount(SettingsPage, {
    props: {
      localePreference: 'system',
      themePreference: 'dark',
      notificationSettings: { enabled: true, sound: true, preview: 'message' },
      defaultRuntimeId: 'external.claude',
      defaultModel: 'model-a',
      runtimes: [
        {
          id: 'external.claude',
          kind: 'externalCli',
          displayName: 'Claude',
          capabilities: [],
          status: 'ready',
        },
      ],
      modelOptions: [{ value: 'model-a', label: 'Model A' }],
      saving: false,
      error: null,
      ...overrides,
    },
    global: { plugins: [i18n] },
  })
}

describe('SettingsPage appearance controls', () => {
  it('renders the selected theme and emits a typed update', async () => {
    const wrapper = mountPage()
    const appearanceGroup = wrapper.findAll('[role="radiogroup"]')[1]

    expect(wrapper.text()).toContain('Appearance')
    expect(appearanceGroup.find('button[aria-checked="true"]').text()).toBe('Dark')

    await appearanceGroup.get('button').trigger('click')

    expect(wrapper.emitted('updateTheme')).toEqual([['system']])
  })

  it('disables appearance choices while settings are saving', () => {
    const wrapper = mountPage('en', { saving: true })
    const appearanceGroup = wrapper.findAll('[role="radiogroup"]')[1]

    expect(appearanceGroup.findAll('button:disabled')).toHaveLength(3)
  })

  it('uses the application menu for default selections', async () => {
    const wrapper = mountPage()

    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(wrapper.findAll('[role="combobox"]')).toHaveLength(2)

    await wrapper.find('[role="combobox"]').trigger('click')

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  })

  it('renders localized appearance copy without exposing keys', () => {
    const wrapper = mountPage('zh-CN', { themePreference: 'system' })

    expect(wrapper.text()).toContain('外观')
    expect(wrapper.text()).toContain('跟随系统')
    expect(wrapper.text()).not.toContain('settings.appearance')
  })

  it('emits notification controls and keeps dependent choices available', async () => {
    const wrapper = mountPage()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    const previewGroup = wrapper.findAll('[role="radiogroup"]')[2]

    await checkboxes[0]!.setValue(false)
    await checkboxes[1]!.setValue(false)
    await previewGroup.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('updateNotificationsEnabled')).toEqual([[false]])
    expect(wrapper.emitted('updateNotificationSound')).toEqual([[false]])
    expect(wrapper.emitted('updateNotificationPreview')).toEqual([['sender']])
  })

  it('disables notification controls while saving and dependencies while turned off', () => {
    const saving = mountPage('en', { saving: true })
    expect(saving.findAll('input[type="checkbox"]:disabled')).toHaveLength(2)
    expect(saving.findAll('[role="radiogroup"]')[2]!.findAll('button:disabled')).toHaveLength(3)

    const disabled = mountPage('en', {
      notificationSettings: { enabled: false, sound: true, preview: 'message' },
    })
    const checkboxes = disabled.findAll('input[type="checkbox"]')
    expect(checkboxes[0]!.attributes('disabled')).toBeUndefined()
    expect(checkboxes[1]!.attributes('disabled')).toBeDefined()
    expect(disabled.findAll('[role="radiogroup"]')[2]!.findAll('button:disabled')).toHaveLength(3)
  })
})
