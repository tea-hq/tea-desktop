// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import en from '@/locales/en'
import type { ChannelUserProfile } from '@/features/channels/contracts'
import WorkspaceRail, { type WorkspaceMode } from './WorkspaceRail.vue'

const imProfile: ChannelUserProfile = {
  accountId: 'im-account-1',
  name: 'OIDC User',
  avatarUrl: 'https://im.example.test/avatar.png',
}

function mountRail(
  activeMode: WorkspaceMode = 'channels',
  pendingTasks = 0,
  profile: ChannelUserProfile | null | undefined = imProfile,
) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(WorkspaceRail, {
    props: {
      activeMode,
      pendingTasks,
      logoutPending: false,
      user: {
        displayName: 'OIDC User',
        preferredUsername: 'oidc.user',
        avatarUrl: 'https://id.example.test/avatar.png',
      },
      ...(profile === undefined ? {} : { imProfile: profile }),
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
    expect(button.get('img').attributes('src')).toBe('https://im.example.test/avatar.png')
    await button.trigger('click')

    expect(wrapper.emitted('select')).toContainEqual(['profile'])
  })

  it('marks the avatar as selected in profile mode', () => {
    const wrapper = mountRail('profile')

    expect(wrapper.get('[data-testid="workspace-profile"]').attributes('aria-pressed')).toBe('true')
  })

  it('renders a stable generated avatar when the IM profile has no avatar', async () => {
    const wrapper = mountRail()
    await wrapper.setProps({
      imProfile: { ...imProfile, avatarUrl: '' },
    })

    expect(wrapper.get('[data-testid="workspace-profile"] img').attributes('src')).toMatch(
      /^data:image\/svg\+xml/,
    )
  })

  it('keeps a neutral placeholder until the IM account is known', () => {
    const wrapper = mountRail('channels', 0, null)

    expect(wrapper.find('[data-testid="workspace-profile"] img').exists()).toBe(false)
    expect(wrapper.get('[data-testid="workspace-profile"]').text()).toBe('OI')
  })

  it('exposes exactly one selected workspace', () => {
    const wrapper = mountRail()
    const selected = wrapper.findAll('button[aria-pressed="true"]')

    expect(selected).toHaveLength(1)
    expect(selected[0]?.attributes('aria-label')).toBe('Channels')
    expect(selected[0]?.classes()).toContain('workspace-rail__button')
  })

  it('opens the task workspace and shows its pending indicator', async () => {
    const wrapper = mountRail('channels', 3)
    const button = wrapper.get('button[aria-label="Tasks"]')

    expect(button.find('.workspace-rail__badge').exists()).toBe(true)
    await button.trigger('click')

    expect(wrapper.emitted('select')).toContainEqual(['tasks'])
  })
})
