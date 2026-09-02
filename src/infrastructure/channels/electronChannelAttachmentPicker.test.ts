import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../electronBridge', () => ({ invoke }))

import { ElectronChannelAttachmentPicker } from './electronChannelAttachmentPicker'

describe('ElectronChannelAttachmentPicker', () => {
  beforeEach(() => invoke.mockReset())

  it('selects and releases opaque handles through allowlisted commands', async () => {
    const attachment = { token: 'file:opaque', name: 'design.png', kind: 'image' as const }
    invoke.mockResolvedValueOnce([attachment]).mockResolvedValueOnce(undefined)
    const picker = new ElectronChannelAttachmentPicker()

    await expect(picker.pick()).resolves.toEqual([attachment])
    await picker.release(attachment.token)

    expect(invoke.mock.calls).toEqual([
      ['select_channel_attachments'],
      ['release_channel_attachment', { token: 'file:opaque' }],
    ])
  })
})
