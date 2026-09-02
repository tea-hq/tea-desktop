import { describe, expect, it } from 'vitest'

import type { ChannelDraft, ChannelDraftClient, SaveChannelDraftRequest } from './contracts'

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
