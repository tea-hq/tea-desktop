import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ElectronChannelDraftService } from './channelDrafts'

async function draftPath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-channel-drafts-'))
  return path.join(directory, 'im-channel-drafts.json')
}

function request(accountRef = 'account-a', channelRef = 'channel-a') {
  return {
    accountRef,
    channelRef,
    text: '@Lin review this',
    mentions: [
      {
        target: { kind: 'user', accountId: 'lin' },
        label: '@Lin',
        ranges: [{ start: 0, end: 4 }],
      },
    ],
  }
}

describe('ElectronChannelDraftService', () => {
  it('persists replacement drafts and isolates account catalogs', async () => {
    const filePath = await draftPath()
    let now = 10
    const service = new ElectronChannelDraftService(filePath, () => now)
    await service.initialize()

    await service.save(request())
    now = 20
    await service.save({ ...request(), text: 'updated', mentions: [] })
    await service.save(request('account-b'))

    expect(service.list('account-a')).toEqual([
      expect.objectContaining({ accountRef: 'account-a', text: 'updated', updatedAt: 20 }),
    ])
    expect(service.list('account-b')).toHaveLength(1)

    const reloaded = new ElectronChannelDraftService(filePath)
    await reloaded.initialize()
    expect(reloaded.list('account-a')[0]?.text).toBe('updated')
  })

  it('removes one composite identity and never persists attachment tokens', async () => {
    const filePath = await draftPath()
    const service = new ElectronChannelDraftService(filePath, () => 1)
    await service.initialize()
    await service.save({ ...request(), attachments: [{ token: 'secret-token' }] })
    await service.save(request('account-a', 'channel-b'))

    await service.remove('account-a', 'channel-a')

    expect(service.list('account-a')).toEqual([
      expect.objectContaining({ channelRef: 'channel-b' }),
    ])
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(await readFile(filePath, 'utf8')).not.toContain('secret-token')
  })

  it('rejects malformed identities, text, and mention ranges', async () => {
    const service = new ElectronChannelDraftService(await draftPath())
    await service.initialize()

    await expect(service.save({ ...request(), accountRef: ' ' })).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
    await expect(service.save({ ...request(), text: '   ', mentions: [] })).rejects.toMatchObject({
      code: 'invalidRequest',
    })
    await expect(
      service.save({
        ...request(),
        mentions: [{ ...request().mentions[0], ranges: [{ start: 1, end: 5 }] }],
      }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
  })

  it('preserves an unsupported schema and recovers an empty catalog', async () => {
    const filePath = await draftPath()
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(filePath, JSON.stringify({ schemaVersion: 99, data: { drafts: [] } }))
    const service = new ElectronChannelDraftService(filePath)

    await service.initialize()

    expect(service.list('account-a')).toEqual([])
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(await readdir(path.dirname(filePath))).toContainEqual(
      expect.stringMatching(/im-channel-drafts\.json\..*\.corrupt\.json$/),
    )
  })
})
