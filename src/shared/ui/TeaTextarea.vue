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
      'w-full min-h-16 max-h-56 resize-y border border-line bg-canvas px-3 py-2.5 leading-[1.45] text-fg outline-none transition-colors placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled read-only:bg-surface read-only:text-dim motion-reduce:transition-none',
      size === 'compact'
        ? 'min-h-9 max-h-28 resize-none rounded-control py-1.5 text-sm'
        : 'rounded-control text-sm',
      invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
    ]"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    @keydown="emit('keydown', $event)"
    @compositionstart="emit('compositionstart')"
    @compositionend="emit('compositionend')"
  />
</template>
