// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import AgentModelMenu from './AgentModelMenu.vue'

const options = [
  { value: 'gpt-5.6-sol', label: '5.6 Sol' },
  { value: 'gpt-5.6-terra', label: '5.6 Terra' },
]

function mountMenu() {
  return mount(AgentModelMenu, {
    props: {
      modelValue: 'gpt-5.6-sol',
      options,
      label: 'Select model',
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

let mountedMenu: ReturnType<typeof mountMenu> | null = null

afterEach(() => {
  mountedMenu?.unmount()
  mountedMenu = null
})

describe('AgentModelMenu', () => {
  it('opens a two-level model and effort menu from the lightweight trigger', async () => {
    const wrapper = (mountedMenu = mountMenu())

    expect(wrapper.get('[role="combobox"]').text()).toContain('5.6 Sol')
    expect(wrapper.get('[role="combobox"]').text()).toContain('Extra High')

    await wrapper.get('[role="combobox"]').trigger('click')
    const menu = document.body.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('5.6 Terra')

    const sections = menu?.querySelectorAll('.agent-model-menu__section')
    expect(sections).toHaveLength(2)
    ;(sections?.[1] as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(menu?.textContent).toContain('Extra High')
    expect(menu?.textContent).toContain('Ultra')
  })

  it('opens from keyboard without relying on the browser select control', async () => {
    const wrapper = (mountedMenu = mountMenu())

    await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('emits model changes and keeps the effort selection visible', async () => {
    const wrapper = (mountedMenu = mountMenu())
    await wrapper.get('[role="combobox"]').trigger('click')

    const menu = document.body.querySelector('[role="menu"]')!
    const terra = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).find((item) =>
      item.textContent?.includes('5.6 Terra'),
    ) as HTMLButtonElement
    terra.click()
    expect(wrapper.emitted('update:modelValue')).toEqual([['gpt-5.6-terra']])

    const effortSection = menu.querySelectorAll(
      '.agent-model-menu__section',
    )[1] as HTMLButtonElement
    effortSection.click()
    await wrapper.vm.$nextTick()
    const ultra = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent?.trim() === 'Ultra',
    ) as HTMLButtonElement
    ultra.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('select-effort')).toEqual([['ultra']])
    expect(wrapper.get('[role="combobox"]').text()).toContain('Ultra')
  })
})
