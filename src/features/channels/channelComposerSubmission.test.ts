import { describe, expect, it, vi } from 'vitest'

import { beginChannelComposerSubmission } from './channelComposerSubmission'

describe('beginChannelComposerSubmission', () => {
  it('starts every attempt and binds reply context only to the first item', () => {
    const first = Promise.resolve()
    const second = Promise.resolve()
    const sender = {
      sendText: vi.fn(() => first),
      sendContent: vi.fn(() => second),
    }
    const replyTo = { channelRef: 'channel', messageClientId: 'message' }
    const mentions = [
      {
        target: { kind: 'user' as const, accountId: 'lin' },
        label: '@Lin',
        ranges: [{ start: 0, end: 4 }],
      },
    ]

    const sends = beginChannelComposerSubmission(sender, {
      text: '@Lin review this',
      replyTo,
      mentions,
      attachments: [{ token: 'file-token', name: 'design.png', kind: 'image' }],
    })

    expect(sends).toEqual([first, second])
    expect(sender.sendText).toHaveBeenCalledWith('@Lin review this', replyTo, mentions)
    expect(sender.sendContent).toHaveBeenCalledWith(
      {
        kind: 'image',
        media: {
          source: { kind: 'localFile', token: 'file-token' },
          name: 'design.png',
        },
      },
      undefined,
    )
  })

  it('attaches reply context to the first media item when text is empty', () => {
    const sender = {
      sendText: vi.fn(async () => undefined),
      sendContent: vi.fn(async () => undefined),
    }
    const replyTo = { channelRef: 'channel', messageClientId: 'message' }

    beginChannelComposerSubmission(sender, {
      text: '',
      replyTo,
      mentions: [],
      attachments: [
        { token: 'first', name: 'first.pdf', kind: 'file' },
        { token: 'second', name: 'second.pdf', kind: 'file' },
      ],
    })

    expect(sender.sendText).not.toHaveBeenCalled()
    expect(sender.sendContent).toHaveBeenNthCalledWith(1, expect.anything(), replyTo)
    expect(sender.sendContent).toHaveBeenNthCalledWith(2, expect.anything(), undefined)
  })
})
