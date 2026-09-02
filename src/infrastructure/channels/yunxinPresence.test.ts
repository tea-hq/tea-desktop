import { describe, expect, it, vi } from 'vitest'

import { ChannelTransportError } from '@/features/channels/contracts'
import {
  mapYunxinPresenceStatuses,
  normalizePresenceAccountIds,
  reconcileYunxinPresenceSubscriptions,
  YUNXIN_PRESENCE_DURATION_SECONDS,
  type YunxinPresenceServicePort,
} from './yunxinPresence'

describe('Yunxin presence mapping', () => {
  it('maps predefined availability without exposing provider status fields', () => {
    expect(
      mapYunxinPresenceStatuses([
        { accountId: 'lin', statusType: 1, clientType: 1, publishTime: 10 },
        {
          accountId: 'meng',
          statusType: 2,
          clientType: 1,
          publishTime: 11,
          serverExtension: JSON.stringify({ online: [{ clientType: 2 }] }),
        },
        {
          accountId: 'yu',
          statusType: 3,
          clientType: 1,
          publishTime: 12,
          serverExtension: JSON.stringify({ online: [] }),
        },
        { accountId: 'chen', statusType: 0, clientType: 1, publishTime: 13 },
      ]),
    ).toEqual([
      { accountId: 'lin', availability: 'online', updatedAt: 10 },
      { accountId: 'meng', availability: 'online', updatedAt: 11 },
      { accountId: 'yu', availability: 'offline', updatedAt: 12 },
      { accountId: 'chen', availability: 'unknown', updatedAt: 13 },
    ])
  })

  it('fails closed for malformed multi-client data and ignores custom statuses', () => {
    expect(
      mapYunxinPresenceStatuses([
        {
          accountId: 'lin',
          statusType: 2,
          clientType: 1,
          publishTime: 20,
          serverExtension: '{"online":',
        },
        {
          accountId: 'lin',
          statusType: 10_001,
          clientType: 1,
          publishTime: 21,
          extension: 'busy',
        },
        { accountId: 'meng', statusType: 1, clientType: 1, publishTime: 22 },
        { accountId: 'meng', statusType: 3, clientType: 1, publishTime: 21 },
      ]),
    ).toEqual([
      { accountId: 'lin', availability: 'offline', updatedAt: 20 },
      { accountId: 'meng', availability: 'online', updatedAt: 22 },
    ])
  })

  it('drops malformed and unbounded provider events', () => {
    expect(
      mapYunxinPresenceStatuses([
        null,
        { accountId: '', statusType: 1, publishTime: 1 },
        { accountId: 'x'.repeat(513), statusType: 1, publishTime: 1 },
        { accountId: 'lin', statusType: 1, publishTime: -1 },
      ]),
    ).toEqual([])
  })
})

describe('Yunxin presence subscription reconciliation', () => {
  it('normalizes a bounded replace set', () => {
    expect(normalizePresenceAccountIds([' lin ', 'meng', 'lin'])).toEqual(['lin', 'meng'])
    expect(normalizePresenceAccountIds([])).toEqual([])
    expect(() =>
      normalizePresenceAccountIds(Array.from({ length: 3_001 }, (_, i) => `a${i}`)),
    ).toThrow(ChannelTransportError)
    expect(() => normalizePresenceAccountIds(['x'.repeat(513)])).toThrow(ChannelTransportError)
    expect(() => normalizePresenceAccountIds(['line\nbreak'])).toThrow(ChannelTransportError)
  })

  it('batches subscriptions at 100 accounts with immediate synchronization', async () => {
    const service = createService()
    const desired = Array.from({ length: 205 }, (_, index) => `account-${index}`)

    const result = await reconcileYunxinPresenceSubscriptions(service, new Set(), desired)

    expect(service.subscribeUserStatus).toHaveBeenCalledTimes(3)
    expect(vi.mocked(service.subscribeUserStatus).mock.calls.map(([request]) => request)).toEqual([
      {
        accountIds: desired.slice(0, 100),
        duration: YUNXIN_PRESENCE_DURATION_SECONDS,
        immediateSync: true,
      },
      {
        accountIds: desired.slice(100, 200),
        duration: YUNXIN_PRESENCE_DURATION_SECONDS,
        immediateSync: true,
      },
      {
        accountIds: desired.slice(200),
        duration: YUNXIN_PRESENCE_DURATION_SECONDS,
        immediateSync: true,
      },
    ])
    expect(result.subscribed).toEqual(new Set(desired))
    expect(result.failed).toBe(false)
  })

  it('unsubscribes removals first and preserves the known successful subset', async () => {
    const order: string[] = []
    const service = createService({
      unsubscribe: async ({ accountIds }) => {
        order.push(`unsubscribe:${accountIds.join(',')}`)
        return ['stale-failed']
      },
      subscribe: async ({ accountIds }) => {
        order.push(`subscribe:${accountIds.join(',')}`)
        return ['new-failed']
      },
    })

    const result = await reconcileYunxinPresenceSubscriptions(
      service,
      new Set(['keep', 'stale-failed']),
      ['keep', 'new-good', 'new-failed'],
    )

    expect(order).toEqual(['unsubscribe:stale-failed', 'subscribe:new-good,new-failed'])
    expect(result.subscribed).toEqual(new Set(['keep', 'stale-failed', 'new-good']))
    expect(result.failed).toBe(true)
  })

  it('renews the full desired set without requesting an immediate replay', async () => {
    const service = createService()

    const result = await reconcileYunxinPresenceSubscriptions(
      service,
      new Set(['lin', 'meng']),
      ['lin', 'meng'],
      { renew: true },
    )

    expect(service.unsubscribeUserStatus).not.toHaveBeenCalled()
    expect(service.subscribeUserStatus).toHaveBeenCalledWith({
      accountIds: ['lin', 'meng'],
      duration: YUNXIN_PRESENCE_DURATION_SECONDS,
      immediateSync: false,
    })
    expect(result).toEqual({ subscribed: new Set(['lin', 'meng']), failed: false })
  })
})

function createService(overrides?: {
  subscribe?: YunxinPresenceServicePort['subscribeUserStatus']
  unsubscribe?: YunxinPresenceServicePort['unsubscribeUserStatus']
}): YunxinPresenceServicePort {
  return {
    subscribeUserStatus: vi.fn(
      overrides?.subscribe ?? (async (_request: { accountIds: string[] }) => []),
    ),
    unsubscribeUserStatus: vi.fn(
      overrides?.unsubscribe ?? (async (_request: { accountIds: string[] }) => []),
    ),
  }
}
