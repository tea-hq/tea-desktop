<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label: string
    rows?: number
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    size?: 'compact' | 'default'
  }>(),
  { rows: 4, placeholder: '', disabled: false, readonly: false, invalid: false, size: 'default' },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  keydown: [event: KeyboardEvent]
  compositionstart: []
  compositionend: []
}>()
</script>
<template>
  <textarea
    :value="modelValue"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :class="[
      'w-full min-h-16 max-h-56 resize-y rounded-control border border-line bg-canvas px-3.5 py-3 leading-[1.45] text-fg outline-none transition-colors placeholder:text-subtle focus:border-fg focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-panel disabled:text-disabled read-only:bg-panel read-only:text-dim motion-reduce:transition-none',
      size === 'compact' ? 'min-h-10 max-h-28 resize-none py-2 text-sm' : 'text-base',
      invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
    ]"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    @keydown="emit('keydown', $event)"
    @compositionstart="emit('compositionstart')"
    @compositionend="emit('compositionend')"
  />
</template>
