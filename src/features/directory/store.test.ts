import { describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDirectoryStore } from './store'
import type { DirectoryClient } from './contracts'

const user = { tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example' }, center: { userId: 'user-1', displayName: 'Ada' }, oidc: { subject: 'oidc-1', preferredUsername: 'ada', email: 'ada@example.test', emailVerified: true }, im: { provider: 'yunxin', account: 'ada-1', status: 'ready' } }

describe('directory store', () => {
  it('loads and filters tenant users', async () => {
    setActivePinia(createPinia())
    const client: DirectoryClient = { listUsers: vi.fn(async () => ({ schemaVersion: 1, users: [user] })) }
    const store = useDirectoryStore(); store.configure(client); await store.refresh()
    expect(store.phase).toBe('ready'); expect(store.filteredUsers).toHaveLength(1)
    store.query = 'ada@example'; expect(store.filteredUsers).toHaveLength(1)
    store.query = 'missing'; expect(store.filteredUsers).toHaveLength(0)
  })

  it('keeps loaded users as stale data after refresh failure', async () => {
    setActivePinia(createPinia())
    let fail = false
    const client: DirectoryClient = { listUsers: vi.fn(async () => { if (fail) throw new Error('offline'); return { schemaVersion: 1, users: [user] } }) }
    const store = useDirectoryStore(); store.configure(client); await store.refresh(); fail = true; await store.refresh()
    expect(store.phase).toBe('stale'); expect(store.users).toHaveLength(1)
  })
})
