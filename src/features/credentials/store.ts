import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { CredentialClient, CredentialMutation, CredentialRecord } from './contracts'

export const useCredentialsStore = defineStore('credentials', () => {
  const records = ref<CredentialRecord[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  let client: CredentialClient | null = null

  function configure(nextClient: CredentialClient): void {
    client = nextClient
  }

  async function initialize(): Promise<void> {
    if (!client || loading.value) return
    loading.value = true
    error.value = null
    try {
      records.value = await client.list()
    } catch {
      error.value = 'management.credentials.loadFailed'
    } finally {
      loading.value = false
    }
  }

  async function save(mutation: CredentialMutation): Promise<boolean> {
    if (!client) return false
    saving.value = true
    error.value = null
    try {
      const next = await client.save(mutation)
      const index = records.value.findIndex(
        (record) => record.pluginId === next.pluginId && record.connectionId === next.connectionId,
      )
      if (index === -1) records.value.push(next)
      else records.value[index] = next
      return true
    } catch {
      error.value = 'management.credentials.saveFailed'
      return false
    } finally {
      saving.value = false
    }
  }

  async function clear(pluginId: string, connectionId: string): Promise<boolean> {
    if (!client) return false
    try {
      await client.clear(pluginId, connectionId)
      const record = records.value.find(
        (item) => item.pluginId === pluginId && item.connectionId === connectionId,
      )
      if (record) record.configured = false
      return true
    } catch {
      error.value = 'management.credentials.clearFailed'
      return false
    }
  }

  return { records, loading, saving, error, configure, initialize, save, clear }
})
