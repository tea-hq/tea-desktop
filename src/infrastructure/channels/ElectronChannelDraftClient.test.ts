import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../electronBridge', () => ({ invoke: mocks.invoke }))

import { ElectronChannelDraftClient } from './ElectronChannelDraftClient'

describe('ElectronChannelDraftClient', () => {
  beforeEach(() => mocks.invoke.mockReset())

  it('uses the allowlisted account-scoped draft commands', async () => {
    const request = {
      accountRef: 'account',
      channelRef: 'channel',
      text: 'Draft',
      mentions: [],
    }
    mocks.invoke.mockResolvedValueOnce([]).mockResolvedValueOnce({ ...request, updatedAt: 1 })
    const client = new ElectronChannelDraftClient()

    await client.list('account')
    await client.save(request)
    await client.remove('account', 'channel')

    expect(mocks.invoke.mock.calls).toEqual([
      ['list_im_channel_drafts', { accountRef: 'account' }],
      ['save_im_channel_draft', { request }],
      ['remove_im_channel_draft', { accountRef: 'account', channelRef: 'channel' }],
    ])
  })
})
