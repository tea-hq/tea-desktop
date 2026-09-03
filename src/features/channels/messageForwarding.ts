import type { ForwardMessageMode, Message } from './contracts'

export const FORWARD_MESSAGE_LIMIT = 100
export const FORWARD_TARGET_LIMIT = 50
export const MERGED_FORWARD_MAX_DEPTH = 3

export type ForwardMessageEligibilityReason =
  'empty' | 'limitExceeded' | 'revoked' | 'unsupportedContent' | 'depthExceeded'

export interface ForwardMessageEligibility {
  eligible: boolean
  reason?: ForwardMessageEligibilityReason
  depth?: number
}

const individualKinds = new Set<Message['content']['kind']>(['text', 'image', 'file', 'video'])
const mergedKinds = new Set<Message['content']['kind']>([
  'text',
  'image',
  'audio',
  'video',
  'file',
  'call',
  'merged',
])

export function forwardMessageEligibility(
  messages: readonly Message[],
  mode: ForwardMessageMode,
): ForwardMessageEligibility {
  if (!messages.length) return { eligible: false, reason: 'empty' }
  if (messages.length > FORWARD_MESSAGE_LIMIT) return { eligible: false, reason: 'limitExceeded' }
  if (messages.some((message) => message.state !== 'active'))
    return { eligible: false, reason: 'revoked' }

  if (mode === 'individual') {
    return messages.every((message) => individualKinds.has(message.content.kind))
      ? { eligible: true }
      : { eligible: false, reason: 'unsupportedContent' }
  }

  if (messages.some((message) => !mergedKinds.has(message.content.kind)))
    return { eligible: false, reason: 'unsupportedContent' }
  const depth =
    Math.max(
      0,
      ...messages.map((message) => (message.content.kind === 'merged' ? message.content.depth : 0)),
    ) + 1
  return depth <= MERGED_FORWARD_MAX_DEPTH
    ? { eligible: true, depth }
    : { eligible: false, reason: 'depthExceeded', depth }
}

export function assertForwardMessageEligibility(
  messages: readonly Message[],
  mode: ForwardMessageMode,
): number | undefined {
  const result = forwardMessageEligibility(messages, mode)
  if (!result.eligible) throw new Error(result.reason)
  return result.depth
}
