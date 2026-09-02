import { describe, expect, it, vi } from 'vitest'

import type { ElectronChannelDraftService } from '../services/channelDrafts'
import { createChannelDraftCommandHandlers } from './channelDraftCommands'

function draftService(): ElectronChannelDraftService {
  return {
    list: vi.fn(() => []),
    save: vi.fn(async (request) => ({ ...request, updatedAt: 1 })),
    remove: vi.fn(async () => undefined),
  } as never
}

describe('channel draft command handlers', () => {
  it('delegates account-scoped draft operations', async () => {
    const channelDrafts = draftService()
    const handlers = createChannelDraftCommandHandlers({ channelDrafts }).handlers
    const request = {
      accountRef: 'account',
      channelRef: 'channel',
      text: 'Draft',
      mentions: [],
    }

    await handlers.list_im_channel_drafts!({ accountRef: 'account' })
    await handlers.save_im_channel_draft!({ request })
    await handlers.remove_im_channel_draft!({ accountRef: 'account', channelRef: 'channel' })

    expect(channelDrafts.list).toHaveBeenCalledWith('account')
    expect(channelDrafts.save).toHaveBeenCalledWith(request)
    expect(channelDrafts.remove).toHaveBeenCalledWith('account', 'channel')
  })

  it('rejects malformed command arguments before delegation', async () => {
    const channelDrafts = draftService()
    const handlers = createChannelDraftCommandHandlers({ channelDrafts }).handlers

    await expect(
      Promise.resolve().then(() => handlers.list_im_channel_drafts!({ accountRef: '' })),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    await expect(
      Promise.resolve().then(() => handlers.save_im_channel_draft!({ request: 'draft' })),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    expect(channelDrafts.list).not.toHaveBeenCalled()
    expect(channelDrafts.save).not.toHaveBeenCalled()
  })
})
