import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { CenterAuthClient, CenterAuthState, EnterpriseDirectory } from './contracts'
import { SIGNED_OUT_STATE } from './contracts'
import { useCenterAuthStore } from './store'

class FakeCenterAuthClient implements CenterAuthClient {
  listener: ((state: CenterAuthState) => void) | null = null
  startedDomain = ''
  resolveCalls = 0
  refreshCalls = 0
  refreshResult: CenterAuthState = structuredClone(SIGNED_OUT_STATE)
  defaultEnterpriseDomain: string | null = null

  async initialize() {
    return { state: structuredClone(SIGNED_OUT_STATE), defaultEnterpriseDomain: this.defaultEnterpriseDomain }
  }
  async resolveEnterprise(domain: string): Promise<EnterpriseDirectory> {
    this.resolveCalls += 1
    if (domain === 'missing.test') throw { code: 'organizationUnavailable' }
    return { organizationDomain: domain.toLowerCase(), displayName: 'Example', loginAvailable: true }
  }
  async startLogin(domain: string): Promise<CenterAuthState> {
    this.startedDomain = domain
    return { ...structuredClone(SIGNED_OUT_STATE), phase: 'browserPending', enterprise: { organizationDomain: domain, displayName: 'Example', loginAvailable: true } }
  }
  async cancelLogin(): Promise<CenterAuthState> {
    return { ...structuredClone(SIGNED_OUT_STATE), generation: 2, errorCode: 'loginCancelled' }
  }
  async refreshBootstrap(): Promise<CenterAuthState> {
    this.refreshCalls += 1
    return structuredClone(this.refreshResult)
  }
  async logout(): Promise<CenterAuthState> { return structuredClone(SIGNED_OUT_STATE) }
  async onStateChanged(listener: (state: CenterAuthState) => void): Promise<() => void> {
    this.listener = listener
    return () => { this.listener = null }
  }
}

describe('center auth store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('resolves the enterprise before starting browser login', async () => {
    const client = new FakeCenterAuthClient()
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    store.domain = 'Example.Test'
    await store.login()
    expect(client.startedDomain).toBe('example.test')
    expect(store.state.phase).toBe('browserPending')
  })

  it('continues login when enterprise discovery emits authoritative state', async () => {
    const client = new FakeCenterAuthClient()
    client.resolveEnterprise = async (domain) => {
      client.resolveCalls += 1
      client.listener?.({ ...structuredClone(SIGNED_OUT_STATE), phase: 'resolving' })
      const enterprise = {
        organizationDomain: domain.toLowerCase(),
        displayName: 'Example',
        loginAvailable: true,
      }
      client.listener?.({ ...structuredClone(SIGNED_OUT_STATE), enterprise })
      return enterprise
    }
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    store.domain = 'Example.Test'

    await store.login()

    expect(client.startedDomain).toBe('example.test')
    expect(store.state.phase).toBe('browserPending')
  })

  it('fills an empty domain from packaged initialization configuration', async () => {
    const client = new FakeCenterAuthClient()
    client.defaultEnterpriseDomain = 'example.test'
    const store = useCenterAuthStore()
    store.configure(client)

    await store.initialize()

    expect(store.domain).toBe('example.test')
  })

  it('keeps a user-entered domain over packaged initialization configuration', async () => {
    const client = new FakeCenterAuthClient()
    client.defaultEnterpriseDomain = 'packaged.example.test'
    const store = useCenterAuthStore()
    store.configure(client)
    store.domain = 'manual.example.test'

    await store.initialize()

    expect(store.domain).toBe('manual.example.test')
  })

  it('keeps an unknown domain editable with a generic error', async () => {
    const store = useCenterAuthStore()
    store.configure(new FakeCenterAuthClient())
    await store.initialize()
    store.domain = 'missing.test'
    await store.login()
    expect(store.domain).toBe('missing.test')
    expect(store.state.errorCode).toBe('organizationUnavailable')
    expect(store.canEnterWorkspace).toBe(false)
  })

  it('enters only authenticated or explicit offline cached states', async () => {
    const client = new FakeCenterAuthClient()
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    client.listener?.({ ...structuredClone(SIGNED_OUT_STATE), phase: 'offlineCached' })
    expect(store.canEnterWorkspace).toBe(true)
  })

  it('ignores duplicate submit while enterprise discovery is pending', async () => {
    const discovery = deferred<EnterpriseDirectory>()
    const client = new FakeCenterAuthClient()
    client.resolveEnterprise = async () => {
      client.resolveCalls += 1
      return discovery.promise
    }
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    store.domain = 'example.test'

    const first = store.login()
    const second = store.login()

    expect(client.resolveCalls).toBe(1)
    discovery.resolve({ organizationDomain: 'example.test', displayName: 'Example', loginAvailable: true })
    await Promise.all([first, second])
  })

  it('cancels pending login and ignores its stale completion and event', async () => {
    const loginStart = deferred<CenterAuthState>()
    const client = new FakeCenterAuthClient()
    client.startLogin = async (domain) => {
      client.startedDomain = domain
      return loginStart.promise
    }
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    store.domain = 'example.test'

    const login = store.login()
    await waitFor(() => client.startedDomain === 'example.test')
    await store.cancelLogin()
    loginStart.resolve({
      ...structuredClone(SIGNED_OUT_STATE),
      generation: 1,
      phase: 'browserPending',
    })
    await login
    client.listener?.({
      ...structuredClone(SIGNED_OUT_STATE),
      generation: 1,
      phase: 'authenticated',
    })

    expect(store.state.phase).toBe('signedOut')
    expect(store.state.generation).toBe(2)
    expect(store.state.errorCode).toBe('loginCancelled')
  })

  it('signs out locally before a slow logout completes', async () => {
    const result = deferred<CenterAuthState>()
    const client = new FakeCenterAuthClient()
    client.logout = () => result.promise
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    client.listener?.({
      ...structuredClone(SIGNED_OUT_STATE),
      generation: 1,
      phase: 'authenticated',
    })

    const logout = store.logout()

    expect(store.state.phase).toBe('signedOut')
    result.resolve({ ...structuredClone(SIGNED_OUT_STATE), generation: 2 })
    await logout
    expect(store.state.generation).toBe(2)
  })

  it('refreshes an offline cached session back to authenticated', async () => {
    const client = new FakeCenterAuthClient()
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    client.listener?.({ ...structuredClone(SIGNED_OUT_STATE), phase: 'offlineCached' })
    client.refreshResult = {
      ...structuredClone(SIGNED_OUT_STATE),
      phase: 'authenticated',
      errorCode: null,
    }

    await store.refresh()

    expect(client.refreshCalls).toBe(1)
    expect(store.state.phase).toBe('authenticated')
    expect(store.pending).toBe(false)
  })

  it('keeps the cached workspace when Center remains unavailable', async () => {
    const client = new FakeCenterAuthClient()
    client.refreshBootstrap = async () => {
      client.refreshCalls += 1
      throw { code: 'centerUnavailable', retryable: true }
    }
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    client.listener?.({
      ...structuredClone(SIGNED_OUT_STATE),
      phase: 'offlineCached',
      errorCode: 'centerUnavailable',
    })

    await store.refresh()

    expect(client.refreshCalls).toBe(1)
    expect(store.state.phase).toBe('offlineCached')
    expect(store.state.errorCode).toBe('centerUnavailable')
    expect(store.canEnterWorkspace).toBe(true)
    expect(store.pending).toBe(false)
  })

  it('requires login when the cached refresh credential was revoked', async () => {
    const client = new FakeCenterAuthClient()
    client.refreshBootstrap = async () => { throw { code: 'recoveryRequired', retryable: false } }
    const store = useCenterAuthStore()
    store.configure(client)
    await store.initialize()
    client.listener?.({ ...structuredClone(SIGNED_OUT_STATE), phase: 'offlineCached' })

    await store.refresh()

    expect(store.state.phase).toBe('recoveryRequired')
    expect(store.canEnterWorkspace).toBe(false)
  })
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (condition()) return
    await Promise.resolve()
  }
  throw new Error('condition not reached')
}
