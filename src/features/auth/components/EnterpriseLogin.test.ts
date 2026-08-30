// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { CenterAuthErrorCode, CenterAuthPhase } from '../contracts'
import EnterpriseLogin from './EnterpriseLogin.vue'

function mountLogin(
  phase: CenterAuthPhase,
  pending: boolean,
  errorCode: CenterAuthErrorCode | null = null,
) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(EnterpriseLogin, {
    props: { domain: 'example.test', phase, pending, errorCode },
    global: { plugins: [i18n] },
  })
}

describe('EnterpriseLogin', () => {
  it('presents the public Tea brand', () => {
    const wrapper = mountLogin('signedOut', false)

    expect(wrapper.text()).toContain('Tea')
    expect(wrapper.text()).not.toContain('Tea Desktop')
  })

  it('emits cancel while browser login is pending', async () => {
    const wrapper = mountLogin('browserPending', true)

    await wrapper.get('button[type="button"]').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
  })

  it('offers sign-in again for a recovery-required session', () => {
    const wrapper = mountLogin('recoveryRequired', false)

    expect(wrapper.get('button[type="submit"]').text()).toContain('Sign in again')
  })

  it('renders the localized authorization-denied message', () => {
    const wrapper = mountLogin('recoveryRequired', false, 'authorizationDenied')

    expect(wrapper.text()).toContain('This device is no longer authorized. Sign in again.')
    expect(wrapper.text()).not.toContain('auth.errors.authorizationDenied')
  })
})
