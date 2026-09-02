import { describe, expect, it } from 'vitest'

import type {
  ChannelAttachmentPicker,
  ChannelDraft,
  ChannelDraftClient,
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
