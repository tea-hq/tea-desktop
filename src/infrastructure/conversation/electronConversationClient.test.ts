import { describe, expect, it, vi } from 'vitest'

import type { ConversationEvent } from '@/features/conversation/contracts'
const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))
vi.mock('../electronBridge', () => ({ invoke: invokeMock, listen: listenMock }))

import { FakeConversationClient, ElectronConversationClient } from './electronConversationClient'

describe('ElectronConversationClient collaboration mapping', () => {
  it('maps binding, source-backed send, and delivery payloads exactly', async () => {
    invokeMock.mockResolvedValue(undefined)
    const client = new ElectronConversationClient()
    const channelBinding = {
      transportId: 'yunxin.web',
      accountRef: 'account-scope',
      channelRef: 'channel-1',
    }
    const source = {
      messageRef: { channelRef: 'channel-1', messageClientId: 'message-1' },
      senderName: 'Lin',
      sentAt: 1,
      sentByCurrentUser: false,
      text: 'Source',
      capturedAt: 2,
      state: 'active' as const,
    }
    const hostTool = {
      name: 'load_channel_messages',
      version: '1.0.0',
      description: 'Main-owned definition mirror',
      inputSchema: { type: 'object' as const },
      outputSchema: { type: 'object' as const },
    }

    await client.loadConversationHistory({
      conversationId: 'conversation-1',
      cursor: 'older',
      limit: 30,
    })
    await client.createConversation('external.codex', {
      idempotencyKey: 'create-1',
      channelBinding,
      hostTools: [hostTool],
    })
    await client.sendMessage('conversation-1', 'Summarize', {
      model: 'default',
      permissionMode: 'readOnly',
      sources: [source],
    })
    await client.completeDelivery('delivery-1', source.messageRef)

    expect(invokeMock.mock.calls).toEqual([
      [
        'load_conversation_history',
        { request: { conversationId: 'conversation-1', cursor: 'older', limit: 30 } },
      ],
      [
        'create_conversation',
        {
          runtimeId: 'external.codex',
          idempotencyKey: 'create-1',
          channelBinding,
          hostTools: [{ name: hostTool.name, version: hostTool.version }],
        },
      ],
      [
        'send_message',
        {
          conversationId: 'conversation-1',
          text: 'Summarize',
          sources: [source],
          model: null,
          permissionMode: 'readOnly',
        },
      ],
      ['complete_draft_delivery', { deliveryId: 'delivery-1', sentMessageRef: source.messageRef }],
    ])
  })

  it('filters conversation events and disposes the exact bridge subscription', async () => {
    const dispose = vi.fn()
    let receive: ((event: { payload: ConversationEvent }) => void) | undefined
    listenMock.mockImplementationOnce(async (_event, listener) => {
      receive = listener
      return dispose
    })
    const client = new ElectronConversationClient()
    const events: ConversationEvent[] = []
    const unsubscribe = await client.subscribeToEvents('conversation-1', (event) =>
      events.push(event),
    )

    receive?.({
      payload: { conversationId: 'conversation-2', sequence: 1, event: { type: 'runStarted' } },
    })
    receive?.({
      payload: { conversationId: 'conversation-1', sequence: 2, event: { type: 'runFinished' } },
    })
    unsubscribe()

    expect(events).toEqual([
      { conversationId: 'conversation-1', sequence: 2, event: { type: 'runFinished' } },
    ])
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('preserves typed command failures for the feature store', async () => {
    invokeMock.mockRejectedValueOnce({ code: 'runtimeUnavailable', retryable: true })
    const client = new ElectronConversationClient()

    await expect(client.listRuntimes()).rejects.toMatchObject({
      code: 'runtimeUnavailable',
      retryable: true,
    })
  })
})

describe('FakeConversationClient collaboration preview', () => {
  it('catalogs bound conversations and emits runtime events', async () => {
    const client = new FakeConversationClient()
    const channelBinding = {
      transportId: 'mock.channel',
      accountRef: 'account-scope',
      channelRef: 'product-collab',
    }
    const created = await client.createConversation('external.codex', {
      idempotencyKey: 'preview-create-1',
      channelBinding,
    })
    const events: ConversationEvent[] = []
    await client.subscribeToEvents(created.handle.conversationId, (event) => events.push(event))

    await client.sendMessage(created.handle.conversationId, 'Summarize decisions', {
      model: 'default',
      permissionMode: 'readOnly',
    })
    await vi.waitFor(() => expect(events).toHaveLength(3))

    expect(created.summary).toMatchObject({ channelBinding })
    expect(
      (await client.listConversations({ filter: { kind: 'binding', binding: channelBinding } }))
        .items,
    ).toHaveLength(1)
    expect(events.map((event) => event.event.type)).toEqual([
      'runStarted',
      'messageDelta',
      'runFinished',
    ])
    expect(events[1]?.event).toMatchObject({
      type: 'messageDelta',
      text: expect.stringContaining('## Summarize decisions'),
    })
  })

  it('reconciles repeated creation keys to one conversation', async () => {
    const client = new FakeConversationClient()
    const options = { idempotencyKey: 'stable-preview-key' }

    const first = await client.createConversation('external.codex', options)
    const retry = await client.createConversation('external.codex', options)

    expect(retry.handle.conversationId).toBe(first.handle.conversationId)
    expect((await client.listConversations({})).items).toHaveLength(1)
  })
})
