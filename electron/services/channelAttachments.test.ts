import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ElectronChannelAttachmentService } from './channelAttachments'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('ElectronChannelAttachmentService', () => {
  it('returns opaque metadata and resolves the selected path only in main', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-channel-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'design.png')
    await writeFile(filePath, 'png fixture')
    const service = new ElectronChannelAttachmentService(async () => [filePath])

    const [attachment] = await service.select()

    expect(attachment).toMatchObject({ name: 'design.png', kind: 'image', mimeType: 'image/png' })
    expect(attachment?.token).toMatch(/^file:/)
    const resolved = await service.resolve(attachment!.token)
    expect(resolved).toMatchObject({ path: filePath, name: 'design.png' })
    expect(JSON.stringify(attachment)).not.toContain(filePath)

    service.release(attachment!.token)
    await expect(service.resolve(attachment!.token)).resolves.toBeNull()
  })

  it('skips missing files and caps the selection at ten entries', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-channel-'))
    temporaryDirectories.push(directory)
    const paths = await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const filePath = path.join(directory, `note-${index}.txt`)
        await writeFile(filePath, 'fixture')
        return filePath
      }),
    )
    const service = new ElectronChannelAttachmentService(async () => [
      path.join(directory, 'missing'),
      ...paths,
    ])

    const attachments = await service.select()

    expect(attachments).toHaveLength(10)
    expect(attachments.every((attachment) => attachment.kind === 'file')).toBe(true)
  })
})
