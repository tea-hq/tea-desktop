import { describe, expect, it, vi } from 'vitest'

import type { ConversationEvent } from '@/features/conversation/contracts'
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('../electronBridge', () => ({ invoke: invokeMock, listen: vi.fn() }))

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

    await client.loadConversationHistory({ conversationId: 'conversation-1', cursor: 'older', limit: 30 })
    await client.createConversation('external.codex', { idempotencyKey: 'create-1', channelBinding })
    await client.sendMessage('conversation-1', 'Summarize', {
      model: 'default', permissionMode: 'readOnly', sources: [source],
    })
    await client.completeDelivery('delivery-1', source.messageRef)

    expect(invokeMock.mock.calls).toEqual([
      ['load_conversation_history', { request: { conversationId: 'conversation-1', cursor: 'older', limit: 30 } }],
      ['create_conversation', { runtimeId: 'external.codex', idempotencyKey: 'create-1', channelBinding, hostTools: [] }],
      ['send_message', {
        conversationId: 'conversation-1',
        text: 'Summarize',
        sources: [source],
        model: null,
        permissionMode: 'readOnly',
      }],
      ['complete_draft_delivery', { deliveryId: 'delivery-1', sentMessageRef: source.messageRef }],
    ])
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
    await client.subscribeToEvents(created.handle.conversationId, event => events.push(event))

    await client.sendMessage(created.handle.conversationId, 'Summarize decisions', {
      model: 'default',
      permissionMode: 'readOnly',
    })
    await vi.waitFor(() => expect(events).toHaveLength(3))

    expect(created.summary).toMatchObject({ channelBinding })
    expect((await client.listConversations({ filter: { kind: 'binding', binding: channelBinding } })).items)
      .toHaveLength(1)
    expect(events.map(event => event.event.type)).toEqual(['runStarted', 'messageDelta', 'runFinished'])
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
