import { describe, expect, it } from 'vitest'

import { collectMessageMentions } from './messageMentions'

describe('collectMessageMentions', () => {
  it('recomputes ranges from selected tokens and drops removed mentions', () => {
    expect(
      collectMessageMentions('@Lin please pair with @Lin', [
        { target: { kind: 'user', accountId: 'lin' }, label: '@Lin' },
        { target: { kind: 'user', accountId: 'removed' }, label: '@Removed' },
      ]),
    ).toEqual([
      {
        target: { kind: 'user', accountId: 'lin' },
        label: '@Lin',
        ranges: [
          { start: 0, end: 4 },
          { start: 22, end: 26 },
        ],
      },
    ])
  })

  it('supports the provider-neutral channel target', () => {
    expect(
      collectMessageMentions('@channel release ready', [
        { target: { kind: 'channel' }, label: '@channel' },
      ]),
    ).toEqual([
      {
        target: { kind: 'channel' },
        label: '@channel',
        ranges: [{ start: 0, end: 8 }],
      },
    ])
  })
})
