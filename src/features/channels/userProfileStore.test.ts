import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChannelTransport, ChannelUserProfile } from './contracts'
import { useChannelUserProfileStore } from './userProfileStore'

const profile = (accountId: string): ChannelUserProfile => ({
  accountId,
  name: accountId.toUpperCase(),
})

function transport(
  load: (accountIds: string[]) => Promise<ChannelUserProfile[]>,
): ChannelTransport {
  return {
    descriptor: () => ({ id: 'test', displayName: 'Test', protocolVersion: 1, capabilities: [] }),
    capabilities: () => [],
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    status: () => ({ phase: 'connected', retryable: false }),
    getUserProfiles: load,
    getSelfProfile: vi.fn(async () => profile('self')),
    listChannels: vi.fn(),
    loadMessages: vi.fn(),
    sendMessage: vi.fn(),
    openDirectConversation: vi.fn(),
    markRead: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(async () => undefined),
  } as unknown as ChannelTransport
}

describe('useChannelUserProfileStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('batches missing account ids and shares an in-flight request', async () => {
    let resolve!: (value: ChannelUserProfile[]) => void
    const getUserProfiles = vi.fn(
      () => new Promise<ChannelUserProfile[]>((done) => (resolve = done)),
    )
    const store = useChannelUserProfileStore()
    store.configure(transport(getUserProfiles))

    const first = store.ensureProfiles(['a', 'b', 'a'])
    const second = store.ensureProfiles(['b', 'a'])
    expect(getUserProfiles).toHaveBeenCalledOnce()
    expect(getUserProfiles).toHaveBeenCalledWith(['a', 'b'])

    resolve([profile('a'), profile('b')])
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(store.getProfile('a')).toEqual(profile('a'))
    expect(store.getProfile('b')).toEqual(profile('b'))
  })

  it('does not let a previous transport write into a newly configured cache', async () => {
    let resolve!: (value: ChannelUserProfile[]) => void
    const staleTransport = transport(
      () => new Promise<ChannelUserProfile[]>((done) => (resolve = done)),
    )
    const currentTransport = transport(async () => [profile('current')])
    const store = useChannelUserProfileStore()
    store.configure(staleTransport)
    const staleRequest = store.ensureProfiles(['stale'])
    store.configure(currentTransport)
    resolve([profile('stale')])
    await staleRequest

    expect(store.getProfile('stale')).toBeNull()
    await store.ensureProfiles(['current'])
    expect(store.getProfile('current')).toEqual(profile('current'))
  })

  it('clears cached profiles when explicitly reset', async () => {
    const store = useChannelUserProfileStore()
    store.configure(transport(async () => [profile('a')]))
    await store.ensureProfiles(['a'])
    store.clear()
    expect(store.profiles.size).toBe(0)
    expect(store.getProfile('a')).toBeNull()
  })
})
