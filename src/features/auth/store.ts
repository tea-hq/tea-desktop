import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { CenterAuthClient, CenterAuthState } from './contracts'
import { SIGNED_OUT_STATE } from './contracts'

export const useCenterAuthStore = defineStore('center-auth', () => {
  const state = ref<CenterAuthState>(structuredClone(SIGNED_OUT_STATE))
  const domain = ref('')
  const client = shallowRef<CenterAuthClient | null>(null)
  const refreshing = ref(false)
  let unsubscribe: (() => void) | null = null
  let operationGeneration = 0
  let refreshGeneration = 0
  let eventsBlocked = false

  const canEnterWorkspace = computed(
    () => state.value.phase === 'authenticated' || state.value.phase === 'offlineCached',
  )
  const pending = computed(
    () =>
      refreshing.value || ['resolving', 'browserPending', 'exchanging'].includes(state.value.phase),
  )

  function configure(value: CenterAuthClient): void {
    operationGeneration += 1
    refreshGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    eventsBlocked = false
    refreshing.value = false
    client.value = value
  }

  async function initialize(): Promise<void> {
    const configured = client.value
    if (!configured) return
    const subscriptionOperation = ++operationGeneration
    unsubscribe?.()
    unsubscribe = null
    try {
      const stop = await configured.onStateChanged((value) => {
        if (configured !== client.value || eventsBlocked) return
        applyState(value)
      })
      if (subscriptionOperation !== operationGeneration || configured !== client.value) {
        stop()
        return
      }
      unsubscribe = stop
      const operation = ++operationGeneration
      const value = await configured.initialize()
      if (operation === operationGeneration && configured === client.value) {
        if (!domain.value.trim() && value.defaultEnterpriseDomain) {
          domain.value = value.defaultEnterpriseDomain
        }
        applyState(value.state)
      }
    } catch (error) {
      if (configured === client.value) applyError(error)
    }
  }

  async function login(): Promise<void> {
    const configured = client.value
    if (!configured || pending.value) return
    const operation = ++operationGeneration
    state.value = { ...state.value, phase: 'resolving', errorCode: null }
    try {
      const enterprise = await configured.resolveEnterprise(domain.value)
      if (operation !== operationGeneration || configured !== client.value) return
      domain.value = enterprise.organizationDomain
      state.value = { ...state.value, enterprise }
      const value = await configured.startLogin(enterprise.organizationDomain)
      if (operation === operationGeneration && configured === client.value) applyState(value)
    } catch (error) {
      if (operation === operationGeneration && configured === client.value) applyError(error)
    }
  }

  async function cancelLogin(): Promise<void> {
    const configured = client.value
    if (!configured || !pending.value) return
    const operation = ++operationGeneration
    eventsBlocked = true
    state.value = {
      ...structuredClone(SIGNED_OUT_STATE),
      generation: state.value.generation,
      enterprise: state.value.enterprise,
      errorCode: 'loginCancelled',
    }
    try {
      const value = await configured.cancelLogin()
      if (operation === operationGeneration && configured === client.value) applyState(value)
    } catch (error) {
      if (operation === operationGeneration && configured === client.value) applyError(error)
    } finally {
      if (operation === operationGeneration) eventsBlocked = false
    }
  }

  async function refresh(): Promise<void> {
    const configured = client.value
    if (!configured || pending.value) return
    const operation = ++operationGeneration
    const refreshOperation = ++refreshGeneration
    refreshing.value = true
    try {
      const value = await configured.refreshBootstrap()
      if (operation === operationGeneration && configured === client.value) applyState(value)
    } catch (error) {
      if (operation === operationGeneration && configured === client.value) applyRefreshError(error)
    } finally {
      if (refreshOperation === refreshGeneration) refreshing.value = false
    }
  }

  async function logout(): Promise<void> {
    const configured = client.value
    if (!configured) return
    const operation = ++operationGeneration
    eventsBlocked = true
    state.value = { ...structuredClone(SIGNED_OUT_STATE), generation: state.value.generation }
    try {
      const value = await configured.logout()
      if (operation === operationGeneration && configured === client.value) applyState(value)
    } catch (error) {
      if (operation === operationGeneration && configured === client.value) applyError(error)
    } finally {
      if (operation === operationGeneration) eventsBlocked = false
    }
  }

  function applyState(value: CenterAuthState): void {
    if (value.generation < state.value.generation) return
    state.value = value
  }

  function applyError(error: unknown): void {
    const code = getErrorCode(error)
    state.value = {
      ...state.value,
      phase: code === 'recoveryRequired' ? 'recoveryRequired' : 'signedOut',
      errorCode: code,
    }
  }

  function applyRefreshError(error: unknown): void {
    const code = getErrorCode(error)
    if (canEnterWorkspace.value && (code === 'centerUnavailable' || code === 'storageFailure')) {
      state.value = { ...state.value, errorCode: code }
      return
    }
    if (code === 'recoveryRequired' || code === 'protocolFailure') {
      state.value = {
        ...structuredClone(SIGNED_OUT_STATE),
        generation: state.value.generation,
        phase: 'recoveryRequired',
        errorCode: code,
      }
      return
    }
    applyError(error)
  }

  function dispose(): void {
    operationGeneration += 1
    refreshGeneration += 1
    eventsBlocked = true
    unsubscribe?.()
    unsubscribe = null
    refreshing.value = false
    client.value = null
  }

  return {
    state,
    domain,
    canEnterWorkspace,
    pending,
    configure,
    initialize,
    login,
    cancelLogin,
    refresh,
    logout,
    dispose,
  }
})

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'protocolFailure'
}
