// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ChannelSelfProfile } from '@/features/channels/contracts'
import type { CenterSelfProfile, ProfileComparison } from '../contracts'
import ProfilePage from './ProfilePage.vue'

const centerProfile: CenterSelfProfile = {
  id: 'center-user-1',
  displayName: 'OIDC User',
  preferredUsername: 'oidc.user',
  email: 'user@example.test',
  emailVerified: false,
  avatarUrl: 'https://id.example.test/avatar.png',
  oidcSubject: 'subject-42',
}

const channelProfile: ChannelSelfProfile = {
  accountId: 'tea_account_1',
  name: 'OIDC User',
  email: 'user@example.test',
  avatarUrl: 'https://id.example.test/avatar.png',
}

const alignedComparisons: ProfileComparison[] = [
  { field: 'displayName', centerValue: 'OIDC User', channelValue: 'OIDC User', status: 'aligned' },
  { field: 'email', centerValue: 'user@example.test', channelValue: 'user@example.test', status: 'aligned' },
  { field: 'avatarUrl', centerValue: centerProfile.avatarUrl, channelValue: channelProfile.avatarUrl, status: 'aligned' },
]

function mountPage(overrides: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(ProfilePage, {
    props: {
      tenantDisplayName: 'Example Organization',
      tenantDomain: 'example.test',
      centerProfile,
      channelProfile,
      providerName: 'Yunxin',
      phase: 'ready',
      alignment: 'aligned',
      comparisons: alignedComparisons,
      errorKey: null,
      offline: false,
      ...overrides,
    },
    global: { plugins: [i18n] },
  })
}

describe('ProfilePage', () => {
  it('renders Center, OIDC, and live IM identity values', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('Example Organization')
    expect(wrapper.text()).toContain('oidc.user')
    expect(wrapper.text()).toContain('subject-42')
    expect(wrapper.text()).toContain('tea_account_1')
    expect(wrapper.get('[data-testid="profile-email-verification"]').text()).toContain('Not asserted by identity provider')
    expect(wrapper.get('[data-testid="profile-alignment"]').text()).toContain('Matched')
    expect(wrapper.findAll('[data-comparison-status="aligned"]')).toHaveLength(3)
  })

  it('makes mismatched fields visually explicit', () => {
    const comparisons: ProfileComparison[] = [
      { field: 'displayName', centerValue: 'OIDC User', channelValue: 'Old name', status: 'mismatched' },
      ...alignedComparisons.slice(1),
    ]
    const wrapper = mountPage({ alignment: 'mismatched', comparisons })

    expect(wrapper.get('[data-testid="profile-alignment"]').text()).toContain('Needs attention')
    expect(wrapper.findAll('[data-comparison-status="mismatched"]')).toHaveLength(1)
  })

  it('shows a bounded loading state without stale IM values', () => {
    const wrapper = mountPage({ phase: 'loading', channelProfile: null, alignment: 'unknown', comparisons: [] })

    expect(wrapper.get('[data-testid="profile-loading"]').text()).toContain('Loading live IM profile')
    expect(wrapper.text()).not.toContain('tea_account_1')
  })

  it('emits retry and close intents from unavailable state', async () => {
    const wrapper = mountPage({
      phase: 'unavailable', channelProfile: null, alignment: 'unknown', comparisons: [],
      errorKey: 'profile.errors.notConnected',
    })

    await wrapper.get('[data-testid="profile-retry"]').trigger('click')
    await wrapper.get('[data-testid="profile-close"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
