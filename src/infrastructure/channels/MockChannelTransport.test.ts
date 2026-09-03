import { describe, expect, it } from 'vitest'
import { MockChannelTransport } from './MockChannelTransport'
import { verifyTransportContract } from './contractTests'

describe('MockChannelTransport', () => {
  it('satisfies the transport contract', async () => {
    await verifyTransportContract(new MockChannelTransport())
  })

  it('declares quick comments as a typed mutation capability', () => {
    const capability = new MockChannelTransport()
      .capabilities()
      .find((value) => value.id === 'message.quickComment')
    expect(capability).toEqual({
      id: 'message.quickComment',
      available: true,
    })
  })

  it('transcribes active audio messages without exposing attachment parameters', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const sent = await transport.sendMessage({
      channelRef: 'product-collab',
      content: {
        kind: 'audio',
        caption: 'Voice note',
        media: {
          source: { kind: 'localFile', token: 'opaque-audio' },
          name: 'release-note.aac',
          mimeType: 'audio/aac',
          durationMs: 2_000,
        },
      },
    })
    const input = structuredClone(sent.ref)

    await expect(transport.transcribeVoice(input)).resolves.toBe('Transcript: Voice note')
    input.messageClientId = 'changed-after-call'
    await expect(
      transport.transcribeVoice({
        channelRef: 'product-collab',
        messageClientId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })

    const text = await transport.sendMessage({
      channelRef: 'product-collab',
      content: { kind: 'text', text: 'Not a voice message' },
    })
    await expect(transport.transcribeVoice(text.ref)).rejects.toMatchObject({
      code: 'invalidRequest',
    })
  })

  it('publishes deterministic provider-neutral presence from replace-set subscriptions', async () => {
    const transport = new MockChannelTransport()
    const events: Array<{ type: string; presences?: unknown[] }> = []
    transport.subscribe((event) => events.push(event))
    await transport.connect()
    const accountIds = ['lin', 'meng', 'lin']

    await transport.setPresenceSubscriptions(accountIds)
    accountIds[0] = 'mutated-after-call'

    expect(events.find((event) => event.type === 'presence.changed')).toMatchObject({
      presences: [
        { accountId: 'lin', availability: 'online' },
        { accountId: 'meng', availability: 'offline' },
      ],
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

  it('provides normalized group details and member pages', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    await expect(transport.getChannelDetails('product-collab')).resolves.toMatchObject({
      channelRef: 'product-collab',
      memberCount: 12,
      memberLimit: 200,
    })
    await expect(
      transport.listChannelMembers({ channelRef: 'product-collab', limit: 2 }),
    ).resolves.toMatchObject({
      items: [
        { accountId: 'me', role: 'owner' },
        { accountId: 'meng', role: 'manager' },
      ],
      hasMore: true,
      nextCursor: '2',
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

  it('searches cloud messages with provider-neutral pagination', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()

    const first = await transport.searchMessages({
      channelRef: 'product-collab',
      keyword: 'Agent',
      limit: 1,
    })
    expect(first.totalCount).toBe(4)
    expect(first.items).toHaveLength(1)
    expect(first.items[0]?.text).toContain('Agent')
    expect(first.hasMore).toBe(true)

    const second = await transport.searchMessages({
      channelRef: 'product-collab',
      keyword: 'Agent',
      limit: 1,
      cursor: first.nextCursor,
    })
    expect(second.items).toHaveLength(1)
    expect(second.hasMore).toBe(true)
    expect(
      new Set([first.items[0]?.ref.messageClientId, second.items[0]?.ref.messageClientId]).size,
    ).toBe(2)
  })

  it('saves messages idempotently, pages the catalog, and removes entries', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 2,
    })

    const first = await transport.saveMessage({
      messageRef: page.items[0]!.ref,
      sourceChannelName: 'Product',
    })
    const duplicate = await transport.saveMessage({ messageRef: page.items[0]!.ref })
    await transport.saveMessage({ messageRef: page.items[1]!.ref })

    expect(duplicate.id).toBe(first.id)
    await expect(transport.listSavedMessages({ limit: 1 })).resolves.toMatchObject({
      totalCount: 2,
      hasMore: true,
      items: [{ id: expect.any(String) }],
    })
    await transport.removeSavedMessage(first.id)
    await expect(transport.listSavedMessages({ limit: 10 })).resolves.toMatchObject({
      totalCount: 1,
      hasMore: false,
    })
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

  it('executes typed message mutations and emits authoritative events', async () => {
    const transport = new MockChannelTransport()
    const events: string[] = []
    transport.subscribe((event) => events.push(event.type))
    await transport.connect()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 5,
    })
    const target = page.items.find((message) => message.sentByCurrentUser)!.ref

    await transport.modifyMessage({ messageRef: target, text: 'edited' })
    await transport.pinMessage({ messageRef: target, pinned: true })
    await expect(transport.listPinnedMessages('product-collab')).resolves.toMatchObject([
      { message: { ref: target, pinned: true } },
    ])
    await transport.quickComment({ messageRef: target, type: 1, active: true })
    await transport.revokeMessage({ messageRef: target })

    expect(events).toEqual(
      expect.arrayContaining([
        'message.upserted',
        'message.pinChanged',
        'message.reactionsChanged',
        'message.revoked',
      ]),
    )
    await transport.deleteMessages({ messageRefs: [target] })
    expect(events.at(-1)).toBe('message.deleted')
  })

  it('replies to a loaded message and forwards it to multiple channels', async () => {
    const transport = new MockChannelTransport()
    const events: string[] = []
    transport.subscribe((event) => events.push(event.type))
    await transport.connect()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 5,
    })
    const original = page.items[0]!

    const reply = await transport.replyMessage({
      channelRef: 'product-collab',
      replyTo: original.ref,
      content: { kind: 'text', text: 'Acknowledged' },
      idempotencyKey: 'reply-1',
    })
    const duplicate = await transport.replyMessage({
      channelRef: 'product-collab',
      replyTo: original.ref,
      content: { kind: 'text', text: 'Acknowledged' },
      idempotencyKey: 'reply-1',
    })

    expect(duplicate).toEqual(reply)
    const afterReply = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 20,
    })
    expect(afterReply.items.at(-1)?.replyTo).toMatchObject({
      ref: original.ref,
      senderName: original.sender.name,
    })

    const second = page.items[1]!
    const forwarded = await transport.forwardMessage({
      messageRefs: [original.ref, second.ref],
      targetChannelRefs: ['runtime-architecture', 'tea-release'],
      mode: 'individual',
      comment: 'Context',
    })
    expect(forwarded.messages).toHaveLength(6)
    expect(events.filter((type) => type === 'message.upserted').length).toBeGreaterThanOrEqual(3)
  })

  it('projects replies as a deterministic message thread', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 20,
    })
    const root = page.items[0]!
    await transport.replyMessage({
      channelRef: 'product-collab',
      replyTo: root.ref,
      content: { kind: 'text', text: 'Follow-up' },
    })

    await expect(transport.loadThread(root.ref)).resolves.toMatchObject({
      channelRef: 'product-collab',
      root: { ref: root.ref },
      replies: [{ text: 'Follow-up' }],
      replyCount: 1,
    })
  })

  it('creates a merged card with an immutable loadable archive', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const page = await transport.loadMessages({
      channelRef: 'product-collab',
      direction: 'before',
      limit: 5,
    })
    const selected = page.items.slice(0, 3)

    const result = await transport.forwardMessage({
      messageRefs: selected.map((message) => message.ref),
      targetChannelRefs: ['runtime-architecture'],
      mode: 'merged',
      sourceChannelName: 'Product collaboration',
    })
    const target = await transport.loadMessages({
      channelRef: 'runtime-architecture',
      direction: 'before',
      limit: 10,
    })
    const card = target.items.at(-1)!
    expect(card.content).toMatchObject({
      kind: 'merged',
      sourceChannelName: 'Product collaboration',
      depth: 1,
    })
    expect(await transport.loadMergedMessages(result.messages[0]!.ref)).toEqual(selected)

    await transport.deleteMessages({ messageRefs: selected.map((message) => message.ref) })
    expect(await transport.loadMergedMessages(card.ref)).toEqual(selected)
  })

  it('rejects unsupported individual content and merged depth overflow', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    const sent = await transport.sendMessage({
      channelRef: 'product-collab',
      content: {
        kind: 'call',
        callType: 1,
        channelId: 'call',
        status: 2,
        durations: [],
        text: 'Call',
      },
    })
    await expect(
      transport.forwardMessage({
        messageRefs: [sent.ref],
        targetChannelRefs: ['runtime-architecture'],
        mode: 'individual',
      }),
    ).rejects.toMatchObject({ code: 'unsupportedCapability' })

    const first = await transport.forwardMessage({
      messageRefs: [sent.ref],
      targetChannelRefs: ['runtime-architecture'],
      mode: 'merged',
    })
    const second = await transport.forwardMessage({
      messageRefs: [first.messages[0]!.ref],
      targetChannelRefs: ['tea-release'],
      mode: 'merged',
    })
    const third = await transport.forwardMessage({
      messageRefs: [second.messages[0]!.ref],
      targetChannelRefs: ['runtime-architecture'],
      mode: 'merged',
    })
    await expect(
      transport.forwardMessage({
        messageRefs: [third.messages[0]!.ref],
        targetChannelRefs: ['tea-release'],
        mode: 'merged',
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
  })

  it('rejects a reply target from another channel', async () => {
    const transport = new MockChannelTransport()
    await transport.connect()
    await expect(
      transport.replyMessage({
        channelRef: 'product-collab',
        replyTo: { channelRef: 'other', messageClientId: 'missing' },
        content: { kind: 'text', text: 'nope' },
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
  })
})
