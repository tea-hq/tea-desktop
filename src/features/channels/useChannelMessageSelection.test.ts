import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { Message, MessageContent } from './contracts'
import { FORWARD_MESSAGE_LIMIT } from './messageForwarding'
import { messageSelectionKey, useChannelMessageSelection } from './useChannelMessageSelection'

function message(id: string, content: MessageContent = { kind: 'text', text: id }): Message {
  return {
    ref: { channelRef: 'c1', messageClientId: id },
    sender: { id: 'u1', name: 'User', isCurrentUser: false },
    sentAt: Number(id.replace(/\D/g, '')) || 1,
    text: id,
    content,
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  }
}

describe('channel message selection', () => {
  it('keeps selection in timeline order and computes mode eligibility', () => {
    const messages = ref([
      message('m1'),
      message('m2', { kind: 'audio', media: {} }),
      message('m3'),
    ])
    const channelRef = ref<string | null>('c1')
    const selection = useChannelMessageSelection(messages, channelRef)

    selection.begin(messages.value[2])
    selection.toggle(messages.value[0]!)
    selection.toggle(messages.value[1]!)

    expect(selection.selectedMessages.value.map(messageSelectionKey)).toEqual([
      messageSelectionKey(messages.value[0]!),
      messageSelectionKey(messages.value[1]!),
      messageSelectionKey(messages.value[2]!),
    ])
    expect(selection.individualEligibility.value).toMatchObject({
      eligible: false,
      reason: 'unsupportedContent',
    })
    expect(selection.mergedEligibility.value).toMatchObject({ eligible: true, depth: 1 })
  })

  it('caps select-all at 100 and resets on channel changes', async () => {
    const messages = ref(
      Array.from({ length: FORWARD_MESSAGE_LIMIT + 2 }, (_, index) => message(`m${index}`)),
    )
    const channelRef = ref<string | null>('c1')
    const selection = useChannelMessageSelection(messages, channelRef)

    selection.selectAllVisible()
    expect(selection.selectedMessages.value).toHaveLength(FORWARD_MESSAGE_LIMIT)
    expect(selection.limitReached.value).toBe(true)
    expect(selection.toggle(messages.value.at(-1)!)).toBe(false)

    channelRef.value = 'c2'
    await Promise.resolve()
    expect(selection.active.value).toBe(false)
    expect(selection.selectedKeys.value).toEqual([])
  })
})
