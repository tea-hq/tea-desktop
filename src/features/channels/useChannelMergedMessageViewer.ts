import { computed, ref, shallowRef } from 'vue'
import type { Message, MessageRef } from './contracts'

interface MergedMessageView {
  message: Message
  items: Message[]
}

export function useChannelMergedMessageViewer(
  load: (messageRef: MessageRef) => Promise<Message[]>,
) {
  const stack = shallowRef<MergedMessageView[]>([])
  const pendingMessage = shallowRef<Message | null>(null)
  const loading = ref(false)
  const errorCode = ref<string | null>(null)
  let operationId = 0

  const open = computed(() => pendingMessage.value !== null || stack.value.length > 0)
  const currentMessage = computed(() => pendingMessage.value ?? stack.value.at(-1)?.message ?? null)
  const items = computed(() => (pendingMessage.value ? [] : (stack.value.at(-1)?.items ?? [])))
  const canGoBack = computed(
    () => stack.value.length > 1 || (pendingMessage.value !== null && stack.value.length > 0),
  )

  async function openMessage(message: Message): Promise<void> {
    if (message.content.kind !== 'merged') return
    const currentOperation = ++operationId
    pendingMessage.value = structuredClone(message)
    loading.value = true
    errorCode.value = null
    try {
      const loaded = await load(message.ref)
      if (currentOperation !== operationId) return
      stack.value = [
        ...stack.value,
        { message: structuredClone(message), items: structuredClone(loaded) },
      ]
      pendingMessage.value = null
    } catch (error) {
      if (currentOperation !== operationId) return
      errorCode.value = transportErrorCode(error)
    } finally {
      if (currentOperation === operationId) loading.value = false
    }
  }

  async function retry(): Promise<void> {
    const message = pendingMessage.value
    if (message) await openMessage(message)
  }

  function back(): void {
    operationId += 1
    loading.value = false
    errorCode.value = null
    if (pendingMessage.value) {
      pendingMessage.value = null
      return
    }
    if (stack.value.length > 1) stack.value = stack.value.slice(0, -1)
  }

  function close(): void {
    operationId += 1
    stack.value = []
    pendingMessage.value = null
    loading.value = false
    errorCode.value = null
  }

  return {
    open,
    currentMessage,
    items,
    loading,
    errorCode,
    canGoBack,
    openMessage,
    retry,
    back,
    close,
  }
}

function transportErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'transport'
}
