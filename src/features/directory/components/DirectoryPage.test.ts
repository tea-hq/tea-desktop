// @vitest-environment happy-dom

import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'

import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import type { DirectoryUser } from '../contracts'
import DirectoryPage from './DirectoryPage.vue'

const users: DirectoryUser[] = [
  {
    tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example Organization' },
    center: { userId: 'user-ada', displayName: 'Ada Lovelace' },
    oidc: {
      subject: 'oidc-ada',
      preferredUsername: 'ada',
      email: 'ada@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'ada-1', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example Organization' },
    center: { userId: 'user-grace', displayName: 'Grace Hopper' },
    oidc: {
      subject: 'oidc-grace',
      preferredUsername: 'grace',
      email: 'grace@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'grace-1', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example Organization' },
    center: { userId: 'user-katherine', displayName: 'Katherine Johnson' },
    oidc: {
      subject: 'oidc-katherine',
      preferredUsername: 'katherine',
      emailVerified: false,
    },
    im: { provider: 'Yunxin', status: 'unavailable' },
  },
]

const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

function setDesktopDetail(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(min-width: 1280px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function mountPage(
  locale: 'en' | 'zh-CN' = 'en',
  overrides: Record<string, unknown> = {},
): VueWrapper {
  setDesktopDetail(true)
  const i18n = createI18n({ legacy: false, locale, messages: { en, 'zh-CN': zhCN } })
  const wrapper = mount(DirectoryPage, {
    props: {
      users,
      totalCount: users.length,
      tenantName: 'Example Organization',
      phase: 'ready',
      errorKey: null,
      query: '',
      actionError: null,
      ...overrides,
    },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('DirectoryPage', () => {
  it('renders an organization scope, member table, and persistent member detail', () => {
    const wrapper = mountPage()

    expect(wrapper.get('[data-testid="directory-scope"]').text()).toContain('Example Organization')
    expect(wrapper.get('[data-testid="directory-scope"]').text()).toContain('All members')
    expect(wrapper.findAll('[data-testid="directory-member-row"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="columnheader"]').map((cell) => cell.text())).toEqual([
      'Member',
      'Email',
      'Messaging',
    ])
    expect(wrapper.get('[data-testid="directory-detail"]').text()).toContain('Ada Lovelace')
    expect(wrapper.get('[data-testid="directory-detail"]').text()).toContain('ada@example.test')
    const listAvatar = wrapper.get('[data-testid="directory-member-row"] img')
    const detailAvatar = wrapper.get('[data-testid="directory-detail"] img')
    expect(listAvatar.attributes('src')).toMatch(/^data:image\/svg\+xml/)
    expect(detailAvatar.attributes('src')).toBe(listAvatar.attributes('src'))
  })

  it('keeps a real directory avatar ahead of the generated fallback', () => {
    const wrapper = mountPage('en', {
      users: users.map((user, index) =>
        index === 0
          ? { ...user, oidc: { ...user.oidc, avatarUrl: 'https://id.example.test/ada.png' } }
          : user,
      ),
    })

    expect(wrapper.get('[data-testid="directory-member-row"] img').attributes('src')).toBe(
      'https://id.example.test/ada.png',
    )
    expect(wrapper.get('[data-testid="directory-detail"] img').attributes('src')).toBe(
      'https://id.example.test/ada.png',
    )
  })

  it('projects the selected member and emits the existing message intent', async () => {
    const wrapper = mountPage()

    await wrapper.findAll('[data-testid="directory-member-row"]')[1]!.trigger('click')

    const detail = wrapper.get('[data-testid="directory-detail"]')
    expect(detail.text()).toContain('Grace Hopper')
    await detail.get('[data-testid="directory-message"]').trigger('click')

    expect(wrapper.emitted('message')).toEqual([[users[1]]])
  })

  it('keeps the durable scope count when a search has no results', () => {
    const wrapper = mountPage('en', { users: [], totalCount: users.length, query: 'missing' })

    expect(wrapper.get('[data-testid="directory-scope"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="directory-empty"]').text()).toContain('No matching people')
  })

  it('renders stable loading rows and exposes the retry intent for failures', async () => {
    const loading = mountPage('en', { users: [], totalCount: 0, phase: 'loading' })
    expect(loading.findAll('[data-testid="directory-loading-row"]')).toHaveLength(6)

    const failed = mountPage('en', {
      users: [],
      totalCount: 0,
      phase: 'error',
      errorKey: 'directory.errors.loadFailed',
    })
    await failed.get('[data-testid="directory-retry"]').trigger('click')
    expect(failed.emitted('retry')).toHaveLength(1)
  })

  it('localizes status copy and disables messaging for unavailable accounts', async () => {
    const wrapper = mountPage('zh-CN')

    expect(wrapper.text()).toContain('消息可用')
    await wrapper.findAll('[data-testid="directory-member-row"]')[2]!.trigger('click')

    const detail = wrapper.get('[data-testid="directory-detail"]')
    expect(detail.text()).toContain('暂无消息账号')
    expect(detail.get('[data-testid="directory-message"]').attributes('disabled')).toBeDefined()
  })
})
