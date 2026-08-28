import { beforeEach, describe, expect, it } from 'vitest'

import type { HostToolCall } from '@/features/conversation/contracts'
import { MockChannelTransport } from './MockChannelTransport'
import { ChannelHistoryToolScope } from './channelHistoryTool'

const anchor = {
  channelRef: 'product-collab',
  messageClientId: 'm-103',
  messageServerId: 'server-m-103',
}

function call(callId: string, argumentsValue: HostToolCall['arguments']): HostToolCall {
  return {
    conversationId: 'conversation-1',
    callId,
    name: 'load_channel_messages',
    arguments: argumentsValue,
  }
}

describe('ChannelHistoryToolScope', () => {
  let transport: MockChannelTransport
  let scope: ChannelHistoryToolScope

  beforeEach(async () => {
    transport = new MockChannelTransport()
    await transport.connect()
    scope = new ChannelHistoryToolScope(transport, 'product-collab', [anchor])
  })

  it('returns chronological sanitized messages and stable cursors', async () => {
    const outcome = await scope.execute(
      call('call-1', {
        direction: 'before',
        cursor: { messageClientId: 'm-103', messageServerId: 'server-m-103' },
        limit: 2,
      }),
    )

    expect(outcome.loadedSources.map((source) => source.messageRef.messageClientId)).toEqual([
      'm-101',
      'm-102',
    ])
    expect(outcome.result).toMatchObject({
      status: 'success',
      output: {
        direction: 'before',
        hasMore: false,
        nextCursor: { messageClientId: 'm-101', messageServerId: 'server-m-101' },
        messages: [
          { ref: { messageClientId: 'm-101' }, sender: '孟凡', text: expect.any(String) },
          { ref: { messageClientId: 'm-102' }, sender: '林晓', text: expect.any(String) },
        ],
      },
    })
    const output = outcome.result.status === 'success' ? outcome.result.output : {}
    expect(JSON.stringify(output)).not.toContain('serverExtension')
    expect(JSON.stringify(output)).not.toContain('receipt')
    expect(JSON.stringify(output)).not.toContain('reaction')
  })

  it('loads the latest bounded page without an anchor', async () => {
    const recentScope = new ChannelHistoryToolScope(transport, 'product-collab')
    const outcome = await recentScope.execute(call('recent', { direction: 'before', limit: 2 }))

    expect(outcome.loadedSources.map((source) => source.messageRef.messageClientId)).toEqual([
      'm-104',
      'm-105',
    ])
    expect(outcome.result).toMatchObject({ status: 'success' })
  })

  it('allows only known cursors from the anchor or prior results', async () => {
    const unknown = await scope.execute(
      call('unknown', {
        direction: 'before',
        cursor: { messageClientId: 'm-101' },
        limit: 1,
      }),
    )
    expect(unknown.result).toMatchObject({ status: 'failure', code: 'invalidRequest' })

    await scope.execute(
      call('first', {
        direction: 'before',
        cursor: { messageClientId: 'm-103', messageServerId: 'server-m-103' },
        limit: 2,
      }),
    )
    const known = await scope.execute(
      call('known', {
        direction: 'after',
        cursor: { messageClientId: 'm-101', messageServerId: 'server-m-101' },
        limit: 1,
      }),
    )
    expect(known.result).toMatchObject({ status: 'success' })
  })

  it('enforces the per-turn call budget and rejects malformed requests', async () => {
    const malformed = await scope.execute(call('malformed', { direction: 'sideways' }))
    expect(malformed.result).toMatchObject({ status: 'failure', code: 'invalidRequest' })

    for (let index = 0; index < 6; index += 1) {
      expect(
        (await scope.execute(call(`call-${index}`, { direction: 'before', limit: 1 }))).result,
      ).toMatchObject({ status: 'success' })
    }
    expect(
      (await scope.execute(call('call-7', { direction: 'before', limit: 1 }))).result,
    ).toMatchObject({ status: 'failure', code: 'limitExceeded' })
  })
})
