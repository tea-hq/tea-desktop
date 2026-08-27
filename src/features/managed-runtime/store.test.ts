import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ManagedWorkspaceClient, ManagedWorkspaceState } from './contracts'
import { useManagedRuntimeStore } from './store'

class FakeManagedClient implements ManagedWorkspaceClient {
  listener: ((state: ManagedWorkspaceState) => void) | null = null
  subscribeCalls = 0
  unsubscribeCalls = 0
  current: ManagedWorkspaceState = {
    generation: 2,
    phase: 'degraded',
    im: { status: 'unavailable', errorCode: 'provider_unavailable' },
    modelProviders: [
      {
        id: 'ready-provider', kind: 'openai_compatible', displayName: 'Ready', status: 'ready',
        models: [{ id: 'model-a', displayName: 'Model A', selectionValue: 'center.ready-provider:model-a' }],
      },
      {
        id: 'disabled-provider', kind: 'openai_compatible', displayName: 'Disabled', status: 'disabled',
        models: [{ id: 'model-b', displayName: 'Model B', selectionValue: 'center.disabled-provider:model-b' }],
      },
    ],
  }
  async state(): Promise<ManagedWorkspaceState> { return structuredClone(this.current) }
  async refresh(): Promise<ManagedWorkspaceState> { return structuredClone(this.current) }
  async onStateChanged(listener: (state: ManagedWorkspaceState) => void): Promise<() => void> {
    this.subscribeCalls += 1
    this.listener = listener
    return () => {
      this.unsubscribeCalls += 1
      if (this.listener === listener) this.listener = null
    }
  }
}

describe('useManagedRuntimeStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('projects only ready model providers and contains no credential fields', async () => {
    const client = new FakeManagedClient()
    const store = useManagedRuntimeStore()
    store.configure(client)
    await store.initialize()

    expect(store.modelOptions).toEqual([
      { value: 'center.ready-provider:model-a', label: 'Ready / Model A' },
    ])
    expect(JSON.stringify(store.state)).not.toMatch(/apiKey|token|appKey/i)
    expect(store.imReady).toBe(false)
  })

  it('replaces its event subscription when initialized again', async () => {
    const client = new FakeManagedClient()
    const store = useManagedRuntimeStore()
    store.configure(client)

    await store.initialize()
    await store.initialize()

    expect(client.subscribeCalls).toBe(2)
    expect(client.unsubscribeCalls).toBe(1)

    store.dispose()
    expect(client.unsubscribeCalls).toBe(2)
  })
})
