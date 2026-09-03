import { describe, expect, it } from 'vitest'

import { MemoryChannelDraftClient } from './MemoryChannelDraftClient'

describe('MemoryChannelDraftClient', () => {
  it('isolates accounts, replaces channel drafts, and returns copies', async () => {
    let now = 1
    const client = new MemoryChannelDraftClient(() => now)
    const request = {
      accountRef: 'account-a',
      channelRef: 'channel',
      text: 'First',
      mentions: [],
    }
    await client.save(request)
    now = 2
    await client.save({ ...request, text: 'Second' })
    await client.save({ ...request, accountRef: 'account-b' })

    const drafts = await client.list('account-a')
    drafts[0]!.text = 'mutated'
    expect((await client.list('account-a'))[0]?.text).toBe('Second')
    expect(await client.list('account-b')).toHaveLength(1)

    await client.remove('account-a', 'channel')
    expect(await client.list('account-a')).toEqual([])
  })
})
