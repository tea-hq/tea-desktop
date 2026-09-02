import { describe, expect, it } from 'vitest'

import { prepareChannelComposerSubmission } from './channelComposerSubmission'

describe('prepareChannelComposerSubmission', () => {
  it('prepares every attempt and binds reply context only to the first item', () => {
    const replyTo = { channelRef: 'channel', messageClientId: 'message' }
    const mentions = [
      {
        target: { kind: 'user' as const, accountId: 'lin' },
        label: '@Lin',
        ranges: [{ start: 0, end: 4 }],
      },
    ]

    const deliveries = prepareChannelComposerSubmission({
      text: '@Lin review this',
      replyTo,
      mentions,
      attachments: [{ token: 'file-token', name: 'design.png', kind: 'image' }],
    })

    expect(deliveries).toEqual([
      {
        content: { kind: 'text', text: '@Lin review this' },
        replyTo,
        mentions,
      },
      {
        content: {
          kind: 'image',
          media: {
            source: { kind: 'localFile', token: 'file-token' },
            name: 'design.png',
          },
        },
      },
    ])
  })

  it('attaches reply context to the first media item when text is empty', () => {
    const replyTo = { channelRef: 'channel', messageClientId: 'message' }

    const deliveries = prepareChannelComposerSubmission({
      text: '',
      replyTo,
      mentions: [],
      attachments: [
        { token: 'first', name: 'first.pdf', kind: 'file' },
        { token: 'second', name: 'second.pdf', kind: 'file' },
      ],
    })

    expect(deliveries).toMatchObject([
      { content: { kind: 'file' }, replyTo },
      { content: { kind: 'file' } },
    ])
    expect(deliveries[1]).not.toHaveProperty('replyTo')
  })
})
