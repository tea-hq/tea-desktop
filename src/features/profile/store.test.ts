import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ChannelCapability,
  ChannelEventListener,
  ChannelSelfProfile,
  ChannelStatus,
  ChannelTransport,
} from '@/features/channels/contracts'
import type { CenterSelfProfile } from './contracts'
import { useProfileStore } from './store'

const centerProfile: CenterSelfProfile = {
  id: 'center-user',
  displayName: 'OIDC User',
  preferredUsername: 'oidc.user',
  email: 'User@Example.test',
  emailVerified: false,
  avatarUrl: 'https://id.example.test/avatar.png',
  oidcSubject: 'oidc-subject-42',
}

const channelProfile: ChannelSelfProfile = {
  accountId: 'tea_account',
  name: 'OIDC User',
  email: 'user@example.test',
  avatarUrl: 'https://id.example.test/avatar.png',
}

function profileTransport(options: {
  status?: ChannelStatus
  capability?: ChannelCapability
  load?: () => Promise<ChannelSelfProfile>
} = {}): ChannelTransport & { emitStatus: (status: ChannelStatus) => void } {
  let status = options.status ?? { phase: 'connected' as const, accountRef: 'safe-ref', retryable: false }
  const listeners = new Set<Parameters<ChannelTransport['subscribe']>[0]>()
  return {
    status: () => status,
    capabilities: () => [options.capability ?? { id: 'profile.self', available: true }],
    descriptor: () => ({ id: 'test.channel', displayName: 'Test IM', protocolVersion: 1, capabilities: [] }),
    getSelfProfile: vi.fn(options.load ?? (async () => structuredClone(channelProfile))),
    subscribe: (listener: ChannelEventListener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emitStatus: (value: ChannelStatus) => {
      status = value
      for (const listener of listeners) {
        listener({ type: 'status.changed', sequence: 1, occurredAt: Date.now(), status: value })
      }
    },
  } as unknown as ChannelTransport & { emitStatus: (status: ChannelStatus) => void }
}

describe('useProfileStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the live channel profile and compares safe identity fields', async () => {
    const store = useProfileStore()
    store.setCenterProfile(centerProfile)
    store.configure(profileTransport())

    await store.refresh()

    expect(store.phase).toBe('ready')
    expect(store.channelProfile).toEqual(channelProfile)
    expect(store.alignment).toBe('aligned')
    expect(store.comparisons.map(value => value.status)).toEqual(['aligned', 'aligned', 'aligned'])
    expect(store.providerName).toBe('Test IM')
  })

  it('projects a reactive bootstrap profile without cloning its Vue proxy', () => {
    const store = useProfileStore()
    const reactiveProfile = reactive(structuredClone(centerProfile))

    expect(() => store.setCenterProfile(reactiveProfile)).not.toThrow()
    expect(store.centerProfile).toEqual(centerProfile)
  })

  it('exposes loading and retries after a redacted transport failure', async () => {
    let resolve!: (value: ChannelSelfProfile) => void
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('provider secret must not escape'))
      .mockImplementationOnce(() => new Promise<ChannelSelfProfile>(done => { resolve = done }))
    const store = useProfileStore()
    store.setCenterProfile(centerProfile)
    store.configure(profileTransport({ load }))

    await store.refresh()
    expect(store.phase).toBe('unavailable')
    expect(store.errorKey).toBe('profile.errors.loadFailed')
    expect(JSON.stringify(store.$state)).not.toContain('provider secret')

    const retry = store.refresh()
    expect(store.phase).toBe('loading')
    resolve(channelProfile)
    await retry
    expect(store.phase).toBe('ready')
  })

  it('does not call the provider while the channel is disconnected', async () => {
    const transport = profileTransport({ status: { phase: 'disconnected', retryable: false } })
    const store = useProfileStore()
    store.configure(transport)

    await store.refresh()

    expect(store.phase).toBe('unavailable')
    expect(store.errorKey).toBe('profile.errors.notConnected')
    expect(transport.getSelfProfile).not.toHaveBeenCalled()
  })

  it('completes the initial load when the channel connects after entering the profile', async () => {
    const transport = profileTransport({ status: { phase: 'disconnected', retryable: false } })
    const store = useProfileStore()
    store.configure(transport)

    await store.refresh()
    transport.emitStatus({ phase: 'connected', accountRef: 'safe-ref', retryable: false })

    await vi.waitFor(() => expect(store.phase).toBe('ready'))
    expect(store.channelProfile).toEqual(channelProfile)
    expect(transport.getSelfProfile).toHaveBeenCalledOnce()
  })

  it('reports an explicitly unsupported transport without calling it', async () => {
    const transport = profileTransport({
      capability: { id: 'profile.self', available: false, reason: 'unsupported' },
    })
    const store = useProfileStore()
    store.configure(transport)

    await store.refresh()

    expect(store.phase).toBe('unsupported')
    expect(store.errorKey).toBe('profile.errors.unsupported')
    expect(transport.getSelfProfile).not.toHaveBeenCalled()
  })

  it('ignores a stale completion after the transport is replaced', async () => {
    let resolveFirst!: (value: ChannelSelfProfile) => void
    const first = profileTransport({
      load: () => new Promise<ChannelSelfProfile>(done => { resolveFirst = done }),
    })
    const secondProfile = { ...channelProfile, accountId: 'second-account' }
    const store = useProfileStore()
    store.configure(first)
    const stale = store.refresh()

    store.configure(profileTransport({ load: async () => secondProfile }))
    await store.refresh()
    resolveFirst({ ...channelProfile, accountId: 'stale-account' })
    await stale

    expect(store.channelProfile?.accountId).toBe('second-account')
  })

  it('marks a one-sided field and changed name as mismatched', async () => {
    const store = useProfileStore()
    store.setCenterProfile(centerProfile)
    store.configure(profileTransport({
      load: async () => ({ accountId: 'tea_account', name: 'Different name' }),
    }))

    await store.refresh()

    expect(store.alignment).toBe('mismatched')
    expect(store.comparisons).toEqual([
      expect.objectContaining({ field: 'displayName', status: 'mismatched' }),
      expect.objectContaining({ field: 'email', status: 'mismatched' }),
      expect.objectContaining({ field: 'avatarUrl', status: 'mismatched' }),
    ])
  })
})
