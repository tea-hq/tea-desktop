<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    rows?: number
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    size?: 'compact' | 'default'
    autoGrow?: boolean
  }>(),
  {
    rows: 4,
    placeholder: '',
    disabled: false,
    readonly: false,
    invalid: false,
    size: 'default',
    autoGrow: false,
  },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  keydown: [event: KeyboardEvent]
  compositionstart: []
  compositionend: []
}>()
const textarea = ref<HTMLTextAreaElement | null>(null)
let resizeObserver: ResizeObserver | null = null
let observedWidth = -1

function resizeToContent(element = textarea.value): void {
  if (!element) return
  if (!props.autoGrow) {
    element.style.removeProperty('height')
    return
  }
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function startObservingSize(): void {
  const element = textarea.value
  if (!props.autoGrow || !element || resizeObserver || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0
    if (width === observedWidth) return
    observedWidth = width
    resizeToContent()
  })
  resizeObserver.observe(element)
}

function stopObservingSize(): void {
  resizeObserver?.disconnect()
  resizeObserver = null
  observedWidth = -1
}

function handleInput(event: Event): void {
  const element = event.target as HTMLTextAreaElement
  resizeToContent(element)
  emit('update:modelValue', element.value)
}

onMounted(() => {
  resizeToContent()
  startObservingSize()
})
watch(
  () => [props.modelValue, props.rows, props.autoGrow] as const,
  () => {
    if (props.autoGrow) startObservingSize()
    else stopObservingSize()
    resizeToContent()
  },
  { flush: 'post' },
)
onBeforeUnmount(stopObservingSize)
</script>
<template>
  <textarea
    ref="textarea"
    :value="modelValue"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :class="[
      'tea-textarea w-full min-h-16 max-h-56 resize-y rounded-control border border-line bg-canvas px-3.5 py-3 leading-[1.45] text-fg outline-none transition-colors placeholder:text-subtle focus:border-fg focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-panel disabled:text-disabled read-only:bg-panel read-only:text-dim motion-reduce:transition-none',
      size === 'compact' ? 'min-h-10 max-h-28 resize-none py-2 text-sm' : 'text-base',
      autoGrow ? 'tea-textarea--auto-grow' : '',
      invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
    ]"
    @input="handleInput"
    @keydown="emit('keydown', $event)"
    @compositionstart="emit('compositionstart')"
    @compositionend="emit('compositionend')"
  />
</template>

<style scoped>
.tea-textarea--auto-grow {
  overflow-y: auto;
  resize: none;
}
</style>
