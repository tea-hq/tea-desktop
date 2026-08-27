import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PluginClient, PluginRecord } from './contracts'

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const busyId = ref<string | null>(null)
  let client: PluginClient | null = null

  function configure(nextClient: PluginClient): void { client = nextClient }
  async function initialize(): Promise<void> {
    if (!client || loading.value) return
    loading.value = true
    error.value = null
    try { plugins.value = await client.list() } catch { error.value = 'management.plugins.loadFailed' }
    finally { loading.value = false }
  }
  async function setEnabled(plugin: PluginRecord, enabled: boolean): Promise<boolean> {
    if (!client) return false
    busyId.value = plugin.id
    try {
      if (enabled) await client.enable(plugin.id)
      else await client.disable(plugin.id)
      plugin.enabled = enabled
      return true
    } catch { error.value = 'management.plugins.updateFailed'; return false }
    finally { busyId.value = null }
  }
  return { plugins, loading, error, busyId, configure, initialize, setEnabled }
})
