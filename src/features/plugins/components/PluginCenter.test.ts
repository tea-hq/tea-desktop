// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'

import en from '@/locales/en'
import type { PluginRecord } from '../contracts'
import PluginCenter from './PluginCenter.vue'

const iconUrl = 'https://example.test/plugin-icon.png'
const mockStore = vi.hoisted(() => ({
  plugins: [] as unknown[],
  remotePlugins: [] as unknown[],
  loading: false,
  remoteLoading: false,
  error: null as string | null,
  remoteError: null as string | null,
  busyId: null as string | null,
  initialize: vi.fn(),
  syncRemote: vi.fn(),
  setEnabled: vi.fn(),
}))

vi.mock('../store', () => ({
  usePluginsStore: () => mockStore,
}))

function plugin(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    id: 'overmind',
    version: 'cloud',
    displayName: 'Overmind 工单',
    description: 'Issue management',
    enabled: true,
    source: 'remote',
    iconUrl,
    actions: [
      {
        id: 'list-issues',
        version: 'cloud',
        description: 'List issues',
        effect: 'read',
      },
    ],
    connections: [],
    ...overrides,
  }
}

function mountCenter(value: PluginRecord): ReturnType<typeof mount> {
  mockStore.plugins = [value]
  mockStore.remotePlugins = [value]

  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(PluginCenter, { global: { plugins: [i18n] } })
}

describe('PluginCenter', () => {
  it('selects a plugin when clicking the row metadata outside the title button', async () => {
    const first = plugin({ displayName: 'Alpha' })
    const second = plugin({ id: 'github', displayName: 'GitHub' })
    mockStore.plugins = [first, second]
    mockStore.remotePlugins = [first, second]

    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(PluginCenter, { global: { plugins: [i18n] } })
    const rows = wrapper.findAll('[data-plugin-row]')

    expect(rows).toHaveLength(2)
    expect(rows[0]?.find('button[aria-pressed]').attributes('aria-pressed')).toBe('true')

    await rows[1]!.find('.i-mdi-cloud-check-outline').trigger('click')

    expect(rows[0]?.find('button[aria-pressed]').attributes('aria-pressed')).toBe('false')
    expect(rows[1]?.find('button[aria-pressed]').attributes('aria-pressed')).toBe('true')
  })

  it('renders a configured plugin icon in the inventory and detail view', async () => {
    const wrapper = mountCenter(plugin())

    const icons = wrapper.findAll('img[data-plugin-icon]')
    expect(icons).toHaveLength(2)
    expect(icons[0]?.attributes('src')).toBe(iconUrl)
    expect(icons[0]?.attributes('alt')).toBe('Overmind 工单')
    expect(wrapper.findAll('[data-plugin-icon-frame]')[0]?.classes()).toContain('bg-canvas')
    expect(wrapper.findAll('[data-plugin-icon-frame]')[0]?.classes()).not.toContain(
      'bg-brand-accent',
    )
  })

  it('falls back to initials in both views when the icon cannot load', async () => {
    const wrapper = mountCenter(plugin())

    await wrapper.get('img[data-plugin-icon]').trigger('error')

    expect(wrapper.findAll('img[data-plugin-icon]')).toHaveLength(0)
    expect(wrapper.findAll('[data-plugin-icon-fallback]')).toHaveLength(2)
    expect(wrapper.findAll('[data-plugin-icon-fallback]').map((node) => node.text())).toEqual([
      'O工',
      'O工',
    ])
    expect(wrapper.findAll('[data-plugin-icon-frame]')[0]?.classes()).toContain('bg-brand-accent')
  })

  it('uses initials immediately when a plugin has no icon URL', async () => {
    const wrapper = mountCenter(plugin({ iconUrl: undefined }))

    expect(wrapper.findAll('img[data-plugin-icon]')).toHaveLength(0)
    expect(wrapper.findAll('[data-plugin-icon-fallback]')).toHaveLength(2)
  })
})
