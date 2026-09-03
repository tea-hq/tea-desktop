import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { PluginClient, PluginRecord, PluginSource } from './contracts'

export const usePluginsStore = defineStore('plugins', () => {
  const localPlugins = ref<PluginRecord[]>([])
  const remotePlugins = ref<PluginRecord[]>([])
  const loading = ref(false)
  const remoteLoading = ref(false)
  const error = ref<string | null>(null)
  const remoteError = ref<string | null>(null)
  const busyId = ref<string | null>(null)
  const lastSyncedAt = ref<number | null>(null)
  let client: PluginClient | null = null

  const plugins = computed(() => [...localPlugins.value, ...remotePlugins.value])

  function configure(nextClient: PluginClient): void {
    client = nextClient
  }
  async function initialize(): Promise<void> {
    if (!client || loading.value) return
    loading.value = true
    error.value = null
    const [localResult, remoteResult] = await Promise.allSettled([
      client.list(),
      client.listRemote ? client.listRemote() : Promise.resolve([]),
    ])
    if (localResult.status === 'fulfilled') {
      localPlugins.value = localResult.value.map((plugin) => withSource(plugin, 'local'))
    } else {
      error.value = 'management.plugins.loadFailed'
    }
    if (remoteResult.status === 'fulfilled') {
      remotePlugins.value = remoteResult.value.map((plugin) => withSource(plugin, 'remote'))
      remoteError.value = null
      lastSyncedAt.value = Date.now()
    } else if (client.listRemote) {
      remoteError.value = 'management.plugins.remoteLoadFailed'
    }
    loading.value = false
  }

  async function syncRemote(): Promise<boolean> {
    if (!client?.listRemote || remoteLoading.value) return false
    remoteLoading.value = true
    remoteError.value = null
    try {
      remotePlugins.value = (await client.listRemote()).map((plugin) =>
        withSource(plugin, 'remote'),
      )
      lastSyncedAt.value = Date.now()
      return true
    } catch {
      remoteError.value = 'management.plugins.remoteLoadFailed'
      return false
    } finally {
      remoteLoading.value = false
    }
  }
  async function setEnabled(plugin: PluginRecord, enabled: boolean): Promise<boolean> {
    if (!client || sourceOf(plugin) === 'remote') return false
    busyId.value = plugin.id
    try {
      if (enabled) await client.enable(plugin.id)
      else await client.disable(plugin.id)
      const local = localPlugins.value.find((value) => value.id === plugin.id)
      if (local) local.enabled = enabled
      return true
    } catch {
      error.value = 'management.plugins.updateFailed'
      return false
    } finally {
      busyId.value = null
    }
  }
  return {
    plugins,
    localPlugins,
    remotePlugins,
    loading,
    remoteLoading,
    error,
    remoteError,
    busyId,
    lastSyncedAt,
    configure,
    initialize,
    syncRemote,
    setEnabled,
  }
})

function sourceOf(plugin: PluginRecord): PluginSource {
  return plugin.source ?? (plugin.executable ? 'local' : 'local')
}

function withSource(plugin: PluginRecord, fallback: PluginSource): PluginRecord {
  return { ...plugin, source: plugin.source ?? fallback }
}
