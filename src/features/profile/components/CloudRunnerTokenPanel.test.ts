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

describe('CloudRunnerTokenPanel', () => {
  it('shows the default command and keeps token actions icon-only', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const command: RunnerRegistrationCommand = {
      tokenId: 'tenant-token',
      scope: 'tenant',
      scopeId: 'tenant-1',
      centerUrl: 'https://center.test',
      command: "npx --yes @tea/runner register --token 'tenant-secret' --install-service",
    }
    const wrapper = mount(CloudRunnerTokenPanel, {
      props: { tokens, command },
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('npx --yes @tea/runner register')
    expect(wrapper.text()).not.toContain('Generate registration command')
    expect(wrapper.text().match(/tenant-secret/g)).toHaveLength(1)
    expect(wrapper.text().match(/tenant-1/g)).toHaveLength(1)
    expect(wrapper.findAll('.rounded-card')).toHaveLength(1)
    expect(wrapper.findAll('button')).toHaveLength(3)
    expect(wrapper.get('[aria-label="Copy"]').classes()).toContain('absolute')
    expect(wrapper.get('[aria-label="Copy"]').classes()).toContain('right-2')
    await wrapper.get('[aria-label="Reset personal token"]').trigger('click')
    expect(wrapper.emitted('resetPersonal')).toHaveLength(1)
    expect(wrapper.find('select').exists()).toBe(false)
  })
})
