// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import WorkspaceRail from './WorkspaceRail.vue'

function mountRail(activeMode: 'channels' | 'profile' = 'channels') {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(WorkspaceRail, {
    props: {
      activeMode,
      pendingTasks: 0,
      logoutPending: false,
      user: {
        displayName: 'OIDC User',
        preferredUsername: 'oidc.user',
        avatarUrl: 'https://id.example.test/avatar.png',
      },
    },
    global: { plugins: [i18n] },
  })
}

describe('WorkspaceRail', () => {
  it('opens profile from the authenticated user avatar', async () => {
    const wrapper = mountRail()
    const button = wrapper.get('[data-testid="workspace-profile"]')

    expect(wrapper.findAll('[data-testid="workspace-profile"]')).toHaveLength(1)
    expect(wrapper.get('nav').element.firstElementChild).toBe(button.element)
    expect(button.get('img').attributes('src')).toBe('https://id.example.test/avatar.png')
    await button.trigger('click')

    expect(wrapper.emitted('select')).toContainEqual(['profile'])
  })

  it('marks the avatar as selected in profile mode', () => {
    const wrapper = mountRail('profile')

    expect(wrapper.get('[data-testid="workspace-profile"]').attributes('aria-pressed')).toBe('true')
  })

  it('exposes exactly one selected workspace', () => {
    const wrapper = mountRail()
    const selected = wrapper.findAll('button[aria-pressed="true"]')

    expect(selected).toHaveLength(1)
    expect(selected[0]?.attributes('aria-label')).toBe('Channels')
    expect(selected[0]?.classes()).toContain('workspace-rail__button')
  })
})
