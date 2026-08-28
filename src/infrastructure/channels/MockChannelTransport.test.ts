import { describe, expect, it } from 'vitest'
import { MockChannelTransport } from './MockChannelTransport'
import { verifyTransportContract } from './contractTests'

describe('MockChannelTransport', () => {
  it('satisfies the transport contract', async () => {
    await verifyTransportContract(new MockChannelTransport())
  })

  it('declares quick comments unavailable', () => {
    const capability = new MockChannelTransport()
      .capabilities()
      .find((value) => value.id === 'message.quickComment')
    expect(capability).toEqual({
      id: 'message.quickComment',
      available: false,
      reason: 'notVerified',
    })
  })

  it('exposes a safe preview self profile', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()

    await expect(transport.getSelfProfile()).resolves.toEqual({
      accountId: 'preview',
      name: 'Tea Preview',
      email: 'preview@example.test',
    })
  })

  it('pages before and after an anchor without returning the anchor', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const initial = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 5,
    })
    const anchor = initial.items[2]!.ref

    const before = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 1,
      anchorMessage: anchor,
    })
    expect(before.items.map((message) => message.ref.messageClientId)).toEqual(['m-102'])
    expect(before.hasMore).toBe(true)
    expect(before.nextAnchor).toEqual(before.items[0]!.ref)

    const after = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'after',
      limit: 1,
      anchorMessage: anchor,
    })
    expect(after.items.map((message) => message.ref.messageClientId)).toEqual(['m-104'])
    expect(after.hasMore).toBe(true)
    expect(after.nextAnchor).toEqual(after.items[0]!.ref)
  })

  it('rejects unknown anchors and invalid limits', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const unknown = { channelRef: 'product-collab', messageClientId: 'missing' }

    await expect(
      transport.loadMessages({
        channelRef: 'product-collab',
        direction: 'before',
        limit: 1,
        anchorMessage: unknown,
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    await expect(
      transport.loadMessages({
        channelRef: 'product-collab',
        direction: 'after',
        limit: 101,
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
  })
})
