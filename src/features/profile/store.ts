import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { ChannelSelfProfile, ChannelTransport } from '@/features/channels/contracts'
import type { CenterSelfProfile, ProfilePhase } from './contracts'
import { compareSelfProfiles, copyCenterSelfProfile, summarizeAlignment } from './contracts'

export const useProfileStore = defineStore('profile', () => {
  const centerProfile = ref<CenterSelfProfile | null>(null)
  const channelProfile = ref<ChannelSelfProfile | null>(null)
  const phase = ref<ProfilePhase>('idle')
  const errorKey = ref<string | null>(null)
  const providerName = ref('IM')
  const transport = shallowRef<ChannelTransport | null>(null)
  let unsubscribe: (() => void) | null = null
  let refreshWhenConnected = false
  let operationGeneration = 0

  const comparisons = computed(() => channelProfile.value
    ? compareSelfProfiles(centerProfile.value, channelProfile.value)
    : [])
  const alignment = computed(() => summarizeAlignment(comparisons.value))

  function setCenterProfile(value: CenterSelfProfile | null): void {
    centerProfile.value = value ? copyCenterSelfProfile(value) : null
  }

  function configure(value: ChannelTransport): void {
    operationGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    refreshWhenConnected = false
    transport.value = value
    channelProfile.value = null
    phase.value = 'idle'
    errorKey.value = null
    try {
      providerName.value = value.descriptor().displayName || 'IM'
    } catch {
      providerName.value = 'IM'
    }
    try {
      unsubscribe = value.subscribe(event => {
        if (event.type !== 'status.changed'
          || event.status.phase !== 'connected'
          || !refreshWhenConnected
          || value !== transport.value) return
        refreshWhenConnected = false
        void refresh()
      })
    } catch {
      unsubscribe = null
    }
  }

  async function refresh(): Promise<void> {
    const configured = transport.value
    const operation = ++operationGeneration
    channelProfile.value = null
    errorKey.value = null
    if (!configured) {
      refreshWhenConnected = false
      phase.value = 'unavailable'
      errorKey.value = 'profile.errors.loadFailed'
      return
    }

    try {
      const capability = configured.capabilities().find(value => value.id === 'profile.self')
      if (!capability?.available) {
        refreshWhenConnected = capability?.reason === 'notConnected'
        phase.value = refreshWhenConnected ? 'unavailable' : 'unsupported'
        errorKey.value = refreshWhenConnected
          ? 'profile.errors.notConnected'
          : 'profile.errors.unsupported'
        return
      }
      if (configured.status().phase !== 'connected') {
        refreshWhenConnected = true
        phase.value = 'unavailable'
        errorKey.value = 'profile.errors.notConnected'
        return
      }
    } catch {
      refreshWhenConnected = false
      phase.value = 'unavailable'
      errorKey.value = 'profile.errors.loadFailed'
      return
    }

    refreshWhenConnected = false
    phase.value = 'loading'
    try {
      const result = await configured.getSelfProfile()
      if (operation !== operationGeneration || configured !== transport.value) return
      channelProfile.value = structuredClone(result)
      phase.value = 'ready'
    } catch (error) {
      if (operation !== operationGeneration || configured !== transport.value) return
      channelProfile.value = null
      const code = transportErrorCode(error)
      if (code === 'unsupportedCapability') {
        refreshWhenConnected = false
        phase.value = 'unsupported'
        errorKey.value = 'profile.errors.unsupported'
      } else {
        refreshWhenConnected = code === 'notConnected'
        phase.value = 'unavailable'
        errorKey.value = code === 'notConnected'
          ? 'profile.errors.notConnected'
          : 'profile.errors.loadFailed'
      }
    }
  }

  function dispose(): void {
    operationGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    refreshWhenConnected = false
    transport.value = null
    centerProfile.value = null
    channelProfile.value = null
    phase.value = 'idle'
    errorKey.value = null
    providerName.value = 'IM'
  }

  return {
    centerProfile,
    channelProfile,
    phase,
    errorKey,
    providerName,
    comparisons,
    alignment,
    setCenterProfile,
    configure,
    refresh,
    dispose,
  }
})

function transportErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'transport'
}
