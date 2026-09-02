import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { ChannelRef, Message } from './contracts'
import { FORWARD_MESSAGE_LIMIT, forwardMessageEligibility } from './messageForwarding'

export function messageSelectionKey(message: Message): string {
  return `${message.ref.channelRef}:${message.ref.messageServerId || message.ref.messageClientId}`
}

export function useChannelMessageSelection(
  messages: MaybeRefOrGetter<readonly Message[]>,
  channelRef: MaybeRefOrGetter<ChannelRef | null>,
) {
  const active = ref(false)
  const selectedKeys = ref<string[]>([])
  const selectedMessages = computed(() => {
    const keys = new Set(selectedKeys.value)
    return toValue(messages).filter((message) => keys.has(messageSelectionKey(message)))
  })
  const individualEligibility = computed(() =>
    forwardMessageEligibility(selectedMessages.value, 'individual'),
  )
  const mergedEligibility = computed(() =>
    forwardMessageEligibility(selectedMessages.value, 'merged'),
  )
  const limitReached = computed(() => selectedKeys.value.length >= FORWARD_MESSAGE_LIMIT)

  function begin(message?: Message): void {
    active.value = true
    selectedKeys.value = message?.state === 'active' ? [messageSelectionKey(message)] : []
  }

  function toggle(message: Message): boolean {
    if (message.state !== 'active') return false
    if (!active.value) begin()
    const key = messageSelectionKey(message)
    if (selectedKeys.value.includes(key)) {
      selectedKeys.value = selectedKeys.value.filter((value) => value !== key)
      return true
    }
    if (limitReached.value) return false
    selectedKeys.value = [...selectedKeys.value, key]
    return true
  }

  function selectAllVisible(): void {
    active.value = true
    selectedKeys.value = toValue(messages)
      .filter((message) => message.state === 'active')
      .slice(0, FORWARD_MESSAGE_LIMIT)
      .map(messageSelectionKey)
  }

  function clear(): void {
    active.value = false
    selectedKeys.value = []
  }

  watch(() => toValue(channelRef), clear)

  return {
    active,
    selectedKeys,
    selectedMessages,
    individualEligibility,
    mergedEligibility,
    limitReached,
    begin,
    toggle,
    selectAllVisible,
    clear,
  }
}
