import { describe, expect, it } from 'vitest'

import { parseYunxinMentions, withYunxinMentions } from './yunxinMentions'

describe('Yunxin mention mapping', () => {
  it('encodes mentions without leaking provider fields into the caller', () => {
    expect(
      withYunxinMentions(
        { source: 'tea' },
        [
          {
            target: { kind: 'user', accountId: 'lin' },
            label: '@Lin',
            ranges: [{ start: 0, end: 4 }],
          },
          {
            target: { kind: 'channel' },
            label: '@channel',
            ranges: [{ start: 5, end: 13 }],
          },
        ],
        '@Lin @channel',
      ),
    ).toEqual({
      source: 'tea',
      yxAitMsg: {
        lin: { text: '@Lin', segments: [{ start: 0, end: 4, broken: false }] },
        ait_all: { text: '@channel', segments: [{ start: 5, end: 13, broken: false }] },
      },
    })
  })

  it('parses valid provider metadata and ignores malformed entries', () => {
    expect(
      parseYunxinMentions({
        yxAitMsg: {
          lin: { text: '@Lin', segments: [{ start: 0, end: 4, broken: false }] },
          invalid: { text: '@Invalid', segments: [{ start: -1, end: 3 }] },
        },
      }),
    ).toEqual([
      {
        target: { kind: 'user', accountId: 'lin' },
        label: '@Lin',
        ranges: [{ start: 0, end: 4 }],
      },
    ])
  })

  it('rejects ranges that do not match the outgoing text', () => {
    expect(() =>
      withYunxinMentions(
        undefined,
        [
          {
            target: { kind: 'user', accountId: 'lin' },
            label: '@Lin',
            ranges: [{ start: 1, end: 5 }],
          },
        ],
        '@Lin hello',
      ),
    ).toThrow('invalidMentionRange')
  })
})
