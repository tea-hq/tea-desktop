// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { RuntimeDescriptor } from '../contracts'
import AgentModelMenu from './AgentModelMenu.vue'

const options = [
  { value: 'gpt-5.6-sol', label: '5.6 Sol' },
  { value: 'gpt-5.6-terra', label: '5.6 Terra' },
]
const runtimes: RuntimeDescriptor[] = [
  {
    id: 'external.claude',
    kind: 'externalCli',
    displayName: 'Claude Code',
    capabilities: ['prompt'],
    status: 'ready',
    models: [
      {
        value: 'tokbox/gpt-5.6-luna',
        providerId: 'tokbox',
        displayName: 'tokbox / GPT-5.6-luna',
        source: 'runtime',
      },
      {
        value: 'tokbox/gpt-5.4',
        providerId: 'tokbox',
        displayName: 'tokbox / gpt-5.4',
        source: 'runtime',
      },
      {
        value: 'claude-sonnet',
        providerId: 'anthropic',
        displayName: 'Claude Sonnet',
        source: 'runtime',
      },
    ],
  },
  {
    id: 'external.codex',
    kind: 'externalCli',
    displayName: 'Codex',
    capabilities: ['prompt'],
    status: 'ready',
    models: [
      {
        value: 'openai/codex-5',
        providerId: 'openai',
        displayName: 'openai / Codex 5',
        source: 'runtime',
      },
    ],
  },
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

function mountLongMenu() {
  return mount(AgentModelMenu, {
    props: {
      modelValue: 'model-1',
      options: Array.from({ length: 30 }, (_, index) => ({
        value: `model-${index + 1}`,
        label: index === 29 ? 'gpt-image-2' : `Model ${index + 1}`,
      })),
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
  it('groups Agent tabs and matching models in the new-session menu', async () => {
    const wrapper = (mountedMenu = mount(AgentModelMenu, {
      props: {
        modelValue: 'tokbox/gpt-5.6-luna',
        options: [{ value: 'tokbox/gpt-5.6-luna', label: 'Tokbox / GPT-5.6-luna' }],
        label: 'Select Agent and model',
        runtimes,
        runtimeId: 'external.claude',
        allowRuntimeSelection: true,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    }))

    expect(wrapper.get('[role="combobox"]').text()).not.toContain('Claude Code')
    expect(wrapper.get('.agent-model-menu__model').text()).toBe('GPT-5.6-luna')
    expect(wrapper.get('.agent-model-menu__model').text()).not.toContain('tokbox /')
    expect(wrapper.get('[role="combobox"] [role="img"][aria-label="Claude Code"]')).toBeTruthy()
    await wrapper.get('[role="combobox"]').trigger('click')
    const menu = document.body.querySelector('[role="menu"]')!
    expect(menu.querySelector('[role="tablist"]')).not.toBeNull()
    expect(menu.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(menu.textContent).toContain('tokbox')
    expect(menu.textContent).toContain('GPT-5.6-luna')
    expect(menu.textContent).not.toContain('tokbox / GPT-5.6-luna')
    expect(menu.querySelectorAll('.agent-model-menu__options-title')).toHaveLength(2)

    const activeTab = menu.querySelector(
      '[role="tab"][aria-label="Claude Code"]',
    ) as HTMLButtonElement
    expect(activeTab.classList.contains('agent-model-menu__runtime-tab--active')).toBe(true)

    const codexTab = menu.querySelector('[role="tab"][aria-label="Codex"]') as HTMLButtonElement
    codexTab.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('select-runtime')).toEqual([['external.codex']])
    expect(menu.textContent).toContain('openai')
    expect(menu.textContent).toContain('Codex 5')
    expect(menu.textContent).not.toContain('openai / Codex 5')

    const codexModel = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent?.trim() === 'Codex 5',
    ) as HTMLButtonElement
    codexModel.click()
    expect(wrapper.emitted('update:modelValue')).toEqual([['openai/codex-5']])
  })

  it('normalizes provider-qualified fallback options when a runtime has no models', async () => {
    const wrapper = (mountedMenu = mount(AgentModelMenu, {
      props: {
        modelValue: 'tokbox/gpt-5.6-luna',
        options: [
          { value: 'tokbox/gpt-5.6-luna', label: 'Tokbox / GPT-5.6-luna' },
          { value: 'tokbox/gpt-5.4-mini', label: 'Tokbox / gpt-5.4-mini' },
          { value: 'backup/gpt-5.6-luna', label: 'Backup / GPT-5.6-luna' },
        ],
        label: 'Select Agent and model',
        runtimes: runtimes.map((runtime) => ({ ...runtime, models: [] })),
        runtimeId: 'external.claude',
        allowRuntimeSelection: true,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    }))

    expect(wrapper.get('.agent-model-menu__model').text()).toBe('GPT-5.6-luna')
    await wrapper.get('[role="combobox"]').trigger('click')
    const menu = document.body.querySelector('[role="menu"]')!
    expect(menu.textContent).toContain('Tokbox')
    expect(menu.textContent).toContain('Backup')
    expect(menu.textContent).toContain('gpt-5.4-mini')
    expect(menu.textContent).not.toContain('Tokbox / gpt-5.4-mini')
    expect(
      Array.from(menu.querySelectorAll('[role="menuitemradio"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['GPT-5.6-luna', 'gpt-5.4-mini', 'GPT-5.6-luna'])
  })

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

  it('keeps long model lists in the scrollable options column', async () => {
    const wrapper = (mountedMenu = mountLongMenu())

    await wrapper.get('[role="combobox"]').trigger('click')

    const menu = document.body.querySelector('[role="menu"]')!
    const optionsPanel = menu.querySelector('.agent-model-menu__options')!
    expect(optionsPanel.classList.contains('agent-model-menu__options')).toBe(true)
    expect(optionsPanel.querySelectorAll('[role="menuitemradio"]')).toHaveLength(30)
    expect(optionsPanel.textContent).toContain('gpt-image-2')
  })

  it('selects models from the displayed catalog when Agent switching is locked', async () => {
    const wrapper = (mountedMenu = mount(AgentModelMenu, {
      props: {
        modelValue: 'claude-sonnet',
        options: [
          { value: 'claude-sonnet', label: 'Claude Sonnet' },
          { value: 'managed-model', label: 'Managed Model', providerId: 'managed' },
        ],
        label: 'Select model',
        runtimes,
        runtimeId: 'external.claude',
        allowRuntimeSelection: false,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    }))

    await wrapper.get('[role="combobox"]').trigger('click')
    const managedModel = Array.from(document.body.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent?.trim() === 'Managed Model',
    ) as HTMLButtonElement
    managedModel.click()

    expect(wrapper.emitted('update:modelValue')).toEqual([['managed-model']])
  })

  it('keeps long model and effort labels on one line in the trigger', () => {
    const wrapper = (mountedMenu = mount(AgentModelMenu, {
      props: {
        modelValue: 'claude-sonnet-4-very-long-display-name',
        options: [
          {
            value: 'claude-sonnet-4-very-long-display-name',
            label: 'Claude Sonnet 4 Very Long Display Name',
          },
        ],
        label: 'Select model',
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    }))

    expect(wrapper.get('.agent-model-menu__model').text()).toBe(
      'Claude Sonnet 4 Very Long Display Name',
    )
    expect(wrapper.get('.agent-model-menu__effort').text()).toBe('Extra High')
    expect(wrapper.get('.agent-model-menu__trigger').classes()).toContain('whitespace-nowrap')
    expect(wrapper.get('.agent-model-menu__model').classes()).toContain('truncate')
    expect(wrapper.get('.agent-model-menu__effort').classes()).toContain('truncate')
  })
})
