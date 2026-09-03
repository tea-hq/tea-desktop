// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import { fullAgentProfile } from '@/app/composerProfiles'
import en from '@/locales/en'
import type { RuntimeDescriptor } from '../contracts'
import AgentConversationComposer from './AgentConversationComposer.vue'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt'],
  status: 'ready',
  models: [
    {
      value: 'claude-sonnet',
      providerId: 'anthropic',
      displayName: 'Claude Sonnet',
      source: 'runtime',
    },
  ],
}
const alternateRuntime: RuntimeDescriptor = {
  ...runtime,
  id: 'external.codex',
  displayName: 'Codex',
  models: [
    {
      value: 'codex-5',
      providerId: 'openai',
      displayName: 'Codex 5',
      source: 'runtime',
    },
  ],
}

function mountComposer(newConversation = false) {
  return mount(AgentConversationComposer, {
    props: {
      profile: fullAgentProfile,
      text: '',
      attachments: [],
      workingDirectory: null,
      projectDirectories: [],
      agentMode: 'local',
      runnerTags: [],
      cloudRunnerTags: [],
      newConversation,
      sources: [],
      runtimes: [runtime, alternateRuntime],
      runtimeId: runtime.id,
      modelOptions: [{ value: 'claude-sonnet', label: 'Claude Sonnet' }],
      model: 'claude-sonnet',
      permissionMode: 'default',
      disabled: false,
      streaming: false,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: {
        ChannelSourceTray: true,
        AgentProjectMenu: true,
        AgentWorkModeMenu: true,
        AgentRunnerTagMenu: true,
      },
    },
  })
}

describe('AgentConversationComposer', () => {
  it('keeps Agent selection inside the model menu and isolates thinking effort for new sessions', () => {
    const fresh = mountComposer(true)
    const active = mountComposer()

    expect(fresh.find('.composer-menu-select--runtime').exists()).toBe(false)
    expect(fresh.find('.composer-menu-select--model').exists()).toBe(true)
    expect(fresh.find('.composer-menu-select--effort').exists()).toBe(true)
    expect(fresh.find('.composer-toolbar--new-conversation').exists()).toBe(true)
    expect(fresh.find('.agent-model-menu__runtime').exists()).toBe(false)
    expect(fresh.find('.agent-model-menu__trigger [role="img"]').exists()).toBe(true)
    expect(
      fresh.find('.composer-menu-select--permission .i-mdi-shield-check-outline').exists(),
    ).toBe(true)
    expect(active.find('.composer-menu-select--runtime').exists()).toBe(false)
    expect(active.find('.composer-menu-select--effort').exists()).toBe(false)
    expect(active.find('.composer-toolbar--new-conversation').exists()).toBe(false)

    fresh.unmount()
    active.unmount()
  })

  it('emits runtime and model selections from the single new-session menu', async () => {
    const wrapper = mountComposer(true)

    await wrapper.get('.composer-menu-select--model [role="combobox"]').trigger('click')
    const menu = document.body.querySelector('[role="menu"]')!
    expect(menu.querySelector('[role="tablist"]')).not.toBeNull()
    ;(menu.querySelector('[role="tab"][aria-label="Codex"]') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('selectRuntime')).toEqual([['external.codex']])

    const codexModel = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent?.trim() === 'Codex 5',
    ) as HTMLButtonElement
    codexModel.click()
    expect(wrapper.emitted('selectModel')).toEqual([['codex-5']])
    wrapper.unmount()
  })
})
