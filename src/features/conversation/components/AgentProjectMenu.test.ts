// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import AgentProjectMenu from './AgentProjectMenu.vue'

let wrapper: ReturnType<typeof mount> | null = null
const global = { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('AgentProjectMenu', () => {
  it('deduplicates projects while keeping distinct full paths selectable', async () => {
    wrapper = mount(AgentProjectMenu, {
      props: {
        label: 'Select project',
        placeholder: 'Choose project',
        newProjectLabel: 'New project',
        projects: ['/work/tea', '/work/tea', '/other/tea'],
      },
      global,
    })

    await wrapper.get('[role="combobox"]').trigger('click')
    const menu = wrapper.get('[role="menu"]')
    expect(menu.findAll('[role="menuitem"]')).toHaveLength(3)
    expect(menu.text()).toContain('tea')

    await menu.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['/other/tea']])
  })

  it('emits a new-project intent instead of changing the selected directory', async () => {
    wrapper = mount(AgentProjectMenu, {
      props: {
        modelValue: '/work/tea',
        label: 'Select project',
        placeholder: 'Choose project',
        newProjectLabel: 'New project',
        projects: ['/work/tea'],
      },
      global,
    })

    await wrapper.get('[role="combobox"]').trigger('click')
    await wrapper.get('[role="menuitem"]:last-child').trigger('click')

    expect(wrapper.emitted('new-project')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
