import { describe, expect, it } from 'vitest'
import type { Message, MessageContent } from './contracts'
import {
  FORWARD_MESSAGE_LIMIT,
  forwardMessageEligibility,
  MERGED_FORWARD_MAX_DEPTH,
} from './messageForwarding'

function message(content: MessageContent, id = 'm1'): Message {
  return {
    ref: { channelRef: 'c1', messageClientId: id },
    sender: { id: 'u1', name: 'User', isCurrentUser: false },
    sentAt: 1,
    text: 'message',
    content,
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  }
}

describe('message forwarding rules', () => {
  it('matches the individual-forward content whitelist', () => {
    for (const content of [
      { kind: 'text', text: 'text' },
      { kind: 'image', media: {} },
      { kind: 'file', media: {} },
      { kind: 'video', media: {} },
    ] satisfies MessageContent[]) {
      expect(forwardMessageEligibility([message(content)], 'individual')).toEqual({
        eligible: true,
      })
    }
    expect(
      forwardMessageEligibility([message({ kind: 'audio', media: {} })], 'individual'),
    ).toMatchObject({ eligible: false, reason: 'unsupportedContent' })
  })

  it('computes merged depth and rejects nesting beyond the shared limit', () => {
    const merged = (depth: number) =>
      message({ kind: 'merged', sourceChannelName: 'Source', abstracts: [], depth })
    expect(forwardMessageEligibility([message({ kind: 'audio', media: {} })], 'merged')).toEqual({
      eligible: true,
      depth: 1,
    })
    expect(forwardMessageEligibility([merged(MERGED_FORWARD_MAX_DEPTH - 1)], 'merged')).toEqual({
      eligible: true,
      depth: MERGED_FORWARD_MAX_DEPTH,
    })
    expect(forwardMessageEligibility([merged(MERGED_FORWARD_MAX_DEPTH)], 'merged')).toMatchObject({
      eligible: false,
      reason: 'depthExceeded',
    })
  })

  it('enforces the 100-message limit and active-message invariant', () => {
    const values = Array.from({ length: FORWARD_MESSAGE_LIMIT + 1 }, (_, index) =>
      message({ kind: 'text', text: String(index) }, `m${index}`),
    )
    expect(forwardMessageEligibility(values, 'merged')).toMatchObject({
      eligible: false,
      reason: 'limitExceeded',
    })
    expect(
      forwardMessageEligibility([{ ...values[0]!, state: 'revoked' }], 'merged'),
    ).toMatchObject({ eligible: false, reason: 'revoked' })
  })
})
