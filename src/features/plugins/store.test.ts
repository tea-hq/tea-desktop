import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PluginClient } from './contracts'
import { usePluginsStore } from './store'

describe('plugins store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps local and cloud catalogs distinct while exposing one inventory', async () => {
    const client: PluginClient = {
      list: vi.fn(async () => [plugin('git', 'local')]),
      listRemote: vi.fn(async () => [plugin('github', 'remote')]),
      enable: vi.fn(),
      disable: vi.fn(),
    }
    const store = usePluginsStore()
    store.configure(client)

    await store.initialize()

    expect(store.localPlugins.map(({ id }) => id)).toEqual(['git'])
    expect(store.remotePlugins.map(({ id }) => id)).toEqual(['github'])
    expect(store.plugins.map(({ id }) => id)).toEqual(['git', 'github'])
    expect(store.lastSyncedAt).toEqual(expect.any(Number))
  })

  it('keeps local data usable when remote sync fails and supports retry', async () => {
    const listRemote = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([plugin('grafana', 'remote')])
    const client: PluginClient = {
      list: vi.fn(async () => [plugin('gitlab', 'local')]),
      listRemote,
      enable: vi.fn(),
      disable: vi.fn(),
    }
    const store = usePluginsStore()
    store.configure(client)

    await store.initialize()
    expect(store.localPlugins.map(({ id }) => id)).toEqual(['gitlab'])
    expect(store.remotePlugins).toEqual([])
    expect(store.remoteError).toBe('management.plugins.remoteLoadFailed')

    await expect(store.syncRemote()).resolves.toBe(true)
    expect(store.remotePlugins.map(({ id }) => id)).toEqual(['grafana'])
    expect(store.remoteError).toBeNull()
  })
})

function plugin(id: string, source: 'local' | 'remote') {
  return {
    id,
    version: '1.0.0',
    displayName: id,
    source,
    enabled: true,
    actions: [],
    connections: [],
  }
}
