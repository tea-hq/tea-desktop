import { describe, expect, it } from 'vitest'
import type { Channel, Message } from './contracts'
import {
  createChannelProjection,
  mergeMessagePage,
  reduceChannelEvent,
  replaceChannels,
} from './projection'

const channel: Channel = {
  ref: 'c1',
  kind: 'group',
  name: 'Channel',
  description: '',
  unreadCount: 2,
  updatedAt: 10,
}

function message(clientId: string, sentAt: number, serverId?: string, text = clientId): Message {
  return {
    ref: { channelRef: 'c1', messageClientId: clientId, messageServerId: serverId },
    sender: { id: 'u1', name: 'User', isCurrentUser: false },
    sentAt,
    text,
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  }
}

describe('channel projection', () => {
  it('normalizes channels and removes message queues for deleted snapshots', () => {
    const projection = createChannelProjection()
    replaceChannels(projection, [channel])
    mergeMessagePage(projection, { channelRef: 'c1', items: [message('m1', 1)], hasMore: false })
    replaceChannels(projection, [])
    expect(projection.channels.size).toBe(0)
    expect(projection.messagesByChannel.size).toBe(0)
  })

  it('merges history and realtime messages by client or server id in stable order', () => {
    const projection = createChannelProjection()
    mergeMessagePage(projection, {
      channelRef: 'c1',
      items: [message('m2', 2, 's2'), message('m1', 1, 's1')],
      hasMore: true,
    })
    reduceChannelEvent(projection, {
      type: 'message.upserted',
      sequence: 1,
      occurredAt: 3,
      messages: [message('other-client', 2, 's2', 'modified'), message('m3', 3, 's3')],
    })
    expect(projection.messagesByChannel.get('c1')?.map((value) => value.text)).toEqual([
      'm1',
      'modified',
      'm3',
    ])
  })

  it('ignores duplicate and out-of-order events', () => {
    const projection = createChannelProjection()
    expect(
      reduceChannelEvent(projection, {
        type: 'message.upserted',
        sequence: 2,
        occurredAt: 2,
        messages: [message('m2', 2)],
      }),
    ).toBe(true)
    expect(
      reduceChannelEvent(projection, {
        type: 'message.upserted',
        sequence: 1,
        occurredAt: 1,
        messages: [message('m1', 1)],
      }),
    ).toBe(false)
    expect(
      projection.messagesByChannel.get('c1')?.map((value) => value.ref.messageClientId),
    ).toEqual(['m2'])
  })

  it('projects modify, revoke, delete, pin, receipt, and history clear events', () => {
    const projection = createChannelProjection()
    mergeMessagePage(projection, {
      channelRef: 'c1',
      items: [message('m1', 1), message('m2', 2), message('m3', 3)],
      hasMore: false,
    })
    reduceChannelEvent(projection, {
      type: 'message.upserted',
      sequence: 1,
      occurredAt: 1,
      messages: [message('m2', 2, undefined, 'edited')],
    })
    reduceChannelEvent(projection, {
      type: 'message.pinChanged',
      sequence: 2,
      occurredAt: 2,
      ref: { channelRef: 'c1', messageClientId: 'm2' },
      pinned: true,
    })
    reduceChannelEvent(projection, {
      type: 'message.receiptChanged',
      sequence: 3,
      occurredAt: 3,
      ref: { channelRef: 'c1', messageClientId: 'm2' },
      receipt: { readCount: 2 },
    })
    reduceChannelEvent(projection, {
      type: 'message.revoked',
      sequence: 4,
      occurredAt: 4,
      refs: [{ channelRef: 'c1', messageClientId: 'm1' }],
    })
    reduceChannelEvent(projection, {
      type: 'message.deleted',
      sequence: 5,
      occurredAt: 5,
      refs: [{ channelRef: 'c1', messageClientId: 'm3' }],
    })
    reduceChannelEvent(projection, {
      type: 'message.historyCleared',
      sequence: 6,
      occurredAt: 6,
      channelRef: 'c1',
      before: 1,
    })
    const values = projection.messagesByChannel.get('c1')!
    expect(values).toHaveLength(1)
    expect(values[0]).toMatchObject({ text: 'edited', pinned: true, receipt: { readCount: 2 } })
  })

  it('bounds each message queue', () => {
    const projection = createChannelProjection()
    mergeMessagePage(
      projection,
      {
        channelRef: 'c1',
        items: [message('m1', 1), message('m2', 2), message('m3', 3)],
        hasMore: false,
      },
      2,
    )
    expect(
      projection.messagesByChannel.get('c1')?.map((value) => value.ref.messageClientId),
    ).toEqual(['m2', 'm3'])
  })
})
