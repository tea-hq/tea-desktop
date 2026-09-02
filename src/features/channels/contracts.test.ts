import { describe, expect, it } from 'vitest'

import type {
  ChannelAttachmentPicker,
  ChannelCapability,
  ChannelDraft,
  ChannelDraftClient,
  ChannelEvent,
  ChannelPresence,
  ChannelTransport,
  OutgoingMessageAttempt,
  SaveChannelDraftRequest,
} from './contracts'

describe('channel draft contracts', () => {
  it('keep human IM drafts provider-neutral and account scoped', async () => {
    const saved: ChannelDraft = {
      accountRef: 'account-ref',
      channelRef: 'channel-ref',
      text: '@Lin review this',
      mentions: [
        {
          target: { kind: 'user', accountId: 'lin' },
          label: '@Lin',
          ranges: [{ start: 0, end: 4 }],
        },
      ],
      updatedAt: 1,
    }
    const client: ChannelDraftClient = {
      list: async () => [saved],
      save: async (_request: SaveChannelDraftRequest) => saved,
      remove: async () => undefined,
    }

    await expect(client.list('account-ref')).resolves.toEqual([saved])
    expect(saved).not.toHaveProperty('attachments')
    expect(saved).not.toHaveProperty('provider')
  })
})

describe('outgoing message contracts', () => {
  it('keep delivery attempts and attachment ownership provider-neutral', async () => {
    const attempt: OutgoingMessageAttempt = {
      attemptId: 'attempt-1',
      idempotencyKey: 'im-send:v1:one',
      operationId: 'operation-1',
      channelRef: 'channel-ref',
      content: { kind: 'text', text: 'Review this' },
      mentions: [],
      createdAt: 1,
      status: 'failed',
      progress: 0,
      attemptNumber: 1,
      retryable: true,
      errorCode: 'transport',
    }
    const picker: ChannelAttachmentPicker = {
      pick: async () => [],
      release: async () => undefined,
    }

    expect(attempt).not.toHaveProperty('provider')
    expect(attempt).not.toHaveProperty('sendingState')
    await expect(picker.release('opaque-token')).resolves.toBeUndefined()
  })
})

describe('contact presence contracts', () => {
  it('keep transient presence and replace-set subscription provider-neutral', async () => {
    const presence: ChannelPresence = {
      accountId: 'lin',
      availability: 'online',
      updatedAt: 1,
    }
    const capability: ChannelCapability = { id: 'presence.subscribe', available: true }
    const event: ChannelEvent = {
      type: 'presence.changed',
      sequence: 1,
      occurredAt: 1,
      presences: [presence],
    }
    const transport: Pick<ChannelTransport, 'setPresenceSubscriptions'> = {
      setPresenceSubscriptions: async () => undefined,
    }

    expect(capability.id).toBe('presence.subscribe')
    expect(event.presences).toEqual([presence])
    expect(presence).not.toHaveProperty('statusType')
    expect(presence).not.toHaveProperty('serverExtension')
    await expect(transport.setPresenceSubscriptions(['lin'])).resolves.toBeUndefined()
  })
})
