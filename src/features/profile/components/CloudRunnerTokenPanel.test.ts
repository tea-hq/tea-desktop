// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../../packages/runner/src/protocol'
import CloudRunnerTokenPanel from './CloudRunnerTokenPanel.vue'

const tokens: RunnerTokenView[] = [
  {
    tokenId: 'tenant-token',
    scope: 'tenant',
    scopeId: 'tenant-1',
    secret: 'tenant-secret',
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    tokenId: 'user-token',
    scope: 'user',
    scopeId: 'user-1',
    secret: 'user-secret',
    createdAt: '2026-09-01T00:00:00Z',
  },
]

function commandFor(scope: 'tenant' | 'user'): RunnerRegistrationCommand {
  const enterprise = scope === 'tenant'
  return {
    tokenId: enterprise ? 'tenant-token' : 'user-token',
    scope,
    scopeId: enterprise ? 'tenant-1' : 'user-1',
    centerUrl: 'https://center.test',
    command: `npx --yes @tea/runner register --token '${enterprise ? 'tenant-secret' : 'user-secret'}' --install-service`,
  }
}

describe('CloudRunnerTokenPanel', () => {
  it('separates enterprise and personal registration into audience tabs', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(CloudRunnerTokenPanel, {
      props: {
        tokens,
        selectedTokenId: 'tenant-token',
        command: commandFor('tenant'),
      },
      global: { plugins: [i18n] },
    })

    const audienceTablist = wrapper.get('[role="tablist"][aria-label="Runner token audience"]')
    const tabs = audienceTablist.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['Enterprise', 'Personal'])
    expect(audienceTablist.get('[role="tab"][aria-selected="true"]').text()).toBe('Enterprise')

    const enterprisePanel = wrapper.get(`[id="${tabs[0]!.attributes('aria-controls')}"]`)
    const personalPanel = wrapper.get(`[id="${tabs[1]!.attributes('aria-controls')}"]`)
    expect(enterprisePanel.attributes('hidden')).toBeUndefined()
    expect(enterprisePanel.text()).toContain('tenant-1')
    expect(enterprisePanel.text()).toContain('tenant-secret')
    expect(enterprisePanel.text()).not.toContain('user-1')
    expect(personalPanel.attributes('hidden')).toBe('')
    expect(personalPanel.text()).toContain('user-1')
    expect(personalPanel.text()).not.toContain('tenant-1')

    const installTablist = enterprisePanel.get(
      '[role="tablist"][aria-label="Runner installation method"]',
    )
    const installTabs = installTablist.findAll('[role="tab"]')
    expect(installTabs.map((tab) => tab.text())).toEqual([
      'npx',
      'cURL',
      'PowerShell',
      'Homebrew',
      'Chocolatey',
    ])
    await installTabs[3]!.trigger('click')
    expect(installTablist.get('[role="tab"][aria-selected="true"]').text()).toBe('Homebrew')
    expect(enterprisePanel.get('[data-testid="runner-command-homebrew"]').text()).toContain(
      'brew install tea/runner/tea-runner',
    )
    expect(enterprisePanel.text()).toContain('Preview - this installer is not available yet')

    await tabs[1]!.trigger('click')
    expect(wrapper.emitted('selectToken')).toEqual([['user-token']])

    await wrapper.setProps({
      selectedTokenId: 'user-token',
      command: commandFor('user'),
    })
    expect(enterprisePanel.attributes('hidden')).toBe('')
    expect(personalPanel.attributes('hidden')).toBeUndefined()
    expect(personalPanel.text()).toContain('user-secret')
    expect(personalPanel.text()).not.toContain('tenant-secret')
    expect(personalPanel.find('select').exists()).toBe(false)

    await personalPanel.get('[aria-label="Reset personal token"]').trigger('click')
    expect(wrapper.emitted('resetPersonal')).toHaveLength(1)
  })

  it('treats the last audience click as authoritative before parent props settle', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(CloudRunnerTokenPanel, {
      props: {
        tokens,
        selectedTokenId: 'tenant-token',
        command: commandFor('tenant'),
      },
      global: { plugins: [i18n] },
    })

    const audienceTablist = wrapper.get('[role="tablist"][aria-label="Runner token audience"]')
    const tabs = audienceTablist.findAll('[role="tab"]')
    await tabs[1]!.trigger('click')
    await tabs[0]!.trigger('click')

    expect(wrapper.emitted('selectToken')).toEqual([['user-token'], ['tenant-token']])
    expect(audienceTablist.get('[role="tab"][aria-selected="true"]').text()).toBe('Enterprise')
  })
})
