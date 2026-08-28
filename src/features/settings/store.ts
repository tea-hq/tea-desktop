import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { applyLocalePreference } from '@/i18n'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type LocalePreference,
  type SettingsClient,
} from './contracts'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(structuredClone(DEFAULT_SETTINGS))
  const initialized = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let client: SettingsClient | null = null
  let writeQueue: Promise<void> = Promise.resolve()
  let revision = 0

  const leftSidebarOpen = computed(() => settings.value.layout.leftSidebarOpen)
  const agentDrawerOpen = computed(() => settings.value.layout.agentDrawerOpen)
  const defaultRuntimeId = computed(() => settings.value.conversationDefaults.runtimeId)

  function configure(nextClient: SettingsClient): void {
    client = nextClient
  }

  async function initialize(): Promise<void> {
    if (initialized.value || loading.value) return
    if (!client) {
      error.value = 'settings.loadFailed'
      applyLocalePreference(settings.value.locale)
      return
    }
    loading.value = true
    error.value = null
    try {
      settings.value = await client.getSettings()
      initialized.value = true
    } catch {
      settings.value = structuredClone(DEFAULT_SETTINGS)
      error.value = 'settings.loadFailed'
    } finally {
      applyLocalePreference(settings.value.locale)
      loading.value = false
    }
  }

  async function setLocalePreference(locale: LocalePreference): Promise<void> {
    await updateSettings((current) => ({ ...current, locale }))
  }

  async function setDefaultRuntime(runtimeId: string): Promise<void> {
    await updateSettings((current) => ({
      ...current,
      conversationDefaults: { runtimeId },
    }))
  }

  async function toggleLeftSidebar(): Promise<void> {
    await updateSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        leftSidebarOpen: !current.layout.leftSidebarOpen,
      },
    }))
  }

  async function openAgentDrawer(): Promise<void> {
    if (settings.value.layout.agentDrawerOpen) return
    await updateSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        agentDrawerOpen: true,
      },
    }))
  }

  async function closeAgentDrawer(): Promise<void> {
    if (!settings.value.layout.agentDrawerOpen) return
    await updateSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        agentDrawerOpen: false,
      },
    }))
  }

  async function toggleAgentDrawer(): Promise<void> {
    await updateSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        agentDrawerOpen: !current.layout.agentDrawerOpen,
      },
    }))
  }

  async function updateSettings(change: (current: AppSettings) => AppSettings): Promise<void> {
    if (!client) {
      error.value = 'settings.saveFailed'
      return
    }
    const previous = cloneSettings(settings.value)
    const next = change(cloneSettings(settings.value))
    const currentRevision = ++revision
    settings.value = next
    error.value = null
    applyLocalePreference(next.locale)
    saving.value = true

    const write = writeQueue.then(async () => {
      const persisted = await client!.updateSettings(next)
      if (revision === currentRevision) settings.value = persisted
    })
    writeQueue = write.catch(() => undefined)

    try {
      await write
    } catch {
      if (revision === currentRevision) {
        settings.value = previous
        applyLocalePreference(previous.locale)
      }
      error.value = 'settings.saveFailed'
    } finally {
      if (revision === currentRevision) saving.value = false
    }
  }

  return {
    settings,
    initialized,
    loading,
    saving,
    error,
    leftSidebarOpen,
    agentDrawerOpen,
    defaultRuntimeId,
    configure,
    initialize,
    setLocalePreference,
    setDefaultRuntime,
    toggleLeftSidebar,
    openAgentDrawer,
    closeAgentDrawer,
    toggleAgentDrawer,
  }
})

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    locale: settings.locale,
    conversationDefaults: { ...settings.conversationDefaults },
    layout: { ...settings.layout },
  }
}
