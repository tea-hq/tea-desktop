import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { ModelOption } from '@/features/conversation/contracts'
import {
  INACTIVE_MANAGED_STATE,
  type ManagedWorkspaceClient,
  type ManagedWorkspaceState,
} from './contracts'

export const useManagedRuntimeStore = defineStore('managed-runtime', () => {
  const state = ref<ManagedWorkspaceState>(structuredClone(INACTIVE_MANAGED_STATE))
  const client = shallowRef<ManagedWorkspaceClient | null>(null)
  const pending = ref(false)
  let unsubscribe: (() => void) | null = null
  let operationGeneration = 0

  const modelOptions = computed<ModelOption[]>(() => state.value.modelProviders
    .filter(provider => provider.status === 'ready')
    .flatMap(provider => provider.models.map(model => ({
      value: model.selectionValue,
      label: `${provider.displayName} / ${model.displayName}`,
    }))))
  const imReady = computed(() => state.value.im?.status === 'ready')

  function configure(value: ManagedWorkspaceClient): void {
    operationGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    client.value = value
  }

  async function initialize(): Promise<void> {
    const configured = client.value
    if (!configured) return
    const operation = ++operationGeneration
    unsubscribe?.()
    unsubscribe = null
    const stop = await configured.onStateChanged(value => {
      if (client.value === configured && value.generation >= state.value.generation) {
        state.value = structuredClone(value)
      }
    })
    if (operation !== operationGeneration || client.value !== configured) {
      stop()
      return
    }
    unsubscribe = stop
    const value = await configured.state()
    if (operation === operationGeneration
      && client.value === configured
      && value.generation >= state.value.generation) {
      state.value = structuredClone(value)
    }
  }

  async function refresh(): Promise<void> {
    const configured = client.value
    if (!configured || pending.value) return
    pending.value = true
    try {
      state.value = await configured.refresh()
    } finally {
      pending.value = false
    }
  }

  function dispose(): void {
    operationGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    client.value = null
    pending.value = false
    state.value = structuredClone(INACTIVE_MANAGED_STATE)
  }

  return { state, pending, modelOptions, imReady, configure, initialize, refresh, dispose }
})
