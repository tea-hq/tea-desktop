import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { AppSettings, SettingsClient } from './contracts'
import { DEFAULT_SETTINGS } from './contracts'
import { useSettingsStore } from './store'

class FakeSettingsClient implements SettingsClient {
  saved = structuredClone(DEFAULT_SETTINGS)
  updates: AppSettings[] = []
  updateError: Error | null = null

  async getSettings(): Promise<AppSettings> {
    return structuredClone(this.saved)
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    this.updates.push(structuredClone(settings))
    if (this.updateError) throw this.updateError
    this.saved = structuredClone(settings)
    return structuredClone(settings)
  }
}

describe('useSettingsStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads persisted settings from the injected client', async () => {
    const client = new FakeSettingsClient()
    client.saved = {
      locale: 'zh-CN',
      conversationDefaults: { runtimeId: 'external.claude' },
      layout: { leftSidebarOpen: false, agentDrawerOpen: true },
    }
    const store = useSettingsStore()
    store.configure(client)

    await store.initialize()

    expect(store.settings).toEqual(client.saved)
    expect(store.initialized).toBe(true)
  })

  it('persists layout intents without changing unrelated settings', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()

    await store.toggleLeftSidebar()
    await store.openAgentDrawer()

    expect(store.leftSidebarOpen).toBe(false)
    expect(store.agentDrawerOpen).toBe(true)
    await store.closeAgentDrawer()
    expect(store.agentDrawerOpen).toBe(false)
    await store.toggleAgentDrawer()
    expect(store.agentDrawerOpen).toBe(true)
    expect(client.saved.conversationDefaults.runtimeId).toBe('builtin.tea')
  })

  it('persists language and default runtime preferences', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()

    await store.setLocalePreference('en')
    await store.setDefaultRuntime('external.codex')

    expect(client.saved.locale).toBe('en')
    expect(client.saved.conversationDefaults.runtimeId).toBe('external.codex')
  })

  it('rolls back the latest optimistic update when persistence fails', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()
    client.updateError = new Error('disk full')

    await store.openAgentDrawer()

    expect(store.agentDrawerOpen).toBe(false)
    expect(store.error).toBe('settings.saveFailed')
  })
})
