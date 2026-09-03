import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      theme: 'dark',
      notifications: { enabled: false, sound: false, preview: 'hidden' },
      conversationDefaults: { runtimeId: 'external.claude', model: null },
      layout: { leftSidebarOpen: false, agentDrawerOpen: true },
    }
    const store = useSettingsStore()
    store.configure(client)

    await store.initialize()

    expect(store.settings).toEqual(client.saved)
    expect(store.initialized).toBe(true)
  })

  it('shares an in-flight initialization request across callers', async () => {
    const client = new FakeSettingsClient()
    let resolveLoad!: (settings: AppSettings) => void
    client.getSettings = vi.fn(
      () =>
        new Promise<AppSettings>((resolve) => {
          resolveLoad = resolve
        }),
    )
    const store = useSettingsStore()
    store.configure(client)

    const first = store.initialize()
    const second = store.initialize()

    expect(client.getSettings).toHaveBeenCalledOnce()
    expect(store.loading).toBe(true)
    resolveLoad(structuredClone(client.saved))
    await Promise.all([first, second])

    expect(store.initialized).toBe(true)
    expect(store.loading).toBe(false)
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
    expect(client.saved.conversationDefaults.runtimeId).toBe('external.claude')
  })

  it('persists language and default runtime preferences', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()

    await store.setLocalePreference('en')
    await store.setDefaultModel('provider/model-a')
    await store.setDefaultRuntime('external.codex')

    expect(client.saved.locale).toBe('en')
    expect(client.saved.conversationDefaults.runtimeId).toBe('external.codex')
    expect(client.saved.conversationDefaults.model).toBe('provider/model-a')
  })

  it.each(['system', 'light', 'dark'] as const)(
    'persists the %s theme preference',
    async (theme) => {
      const client = new FakeSettingsClient()
      const store = useSettingsStore()
      store.configure(client)
      await store.initialize()

      await store.setThemePreference(theme)

      expect(client.saved.theme).toBe(theme)
      expect(store.settings.theme).toBe(theme)
    },
  )

  it('persists desktop notification preferences without changing unrelated settings', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()

    await store.setNotificationsEnabled(false)
    await store.setNotificationSound(false)
    await store.setNotificationPreview('sender')

    expect(client.saved.notifications).toEqual({
      enabled: false,
      sound: false,
      preview: 'sender',
    })
    expect(client.saved.theme).toBe('system')
  })

  it('rolls back a theme preference when persistence fails', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()
    client.updateError = new Error('disk full')

    await store.setThemePreference('dark')

    expect(store.settings.theme).toBe('system')
    expect(store.error).toBe('settings.saveFailed')
  })

  it('rolls back notification preferences when persistence fails', async () => {
    const client = new FakeSettingsClient()
    const store = useSettingsStore()
    store.configure(client)
    await store.initialize()
    client.updateError = new Error('disk full')

    await store.setNotificationPreview('hidden')

    expect(store.settings.notifications.preview).toBe('message')
    expect(store.error).toBe('settings.saveFailed')
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
