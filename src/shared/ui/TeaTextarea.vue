<script setup lang="ts">
withDefaults(defineProps<{ modelValue: string; label: string; rows?: number; placeholder?: string; disabled?: boolean; readonly?: boolean; invalid?: boolean; size?: 'compact' | 'default' }>(), { rows: 4, placeholder: '', disabled: false, readonly: false, invalid: false, size: 'default' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; keydown: [event: KeyboardEvent]; compositionstart: []; compositionend: [] }>()
</script>
<template>
  <textarea :class="{ compact: size === 'compact' }" :value="modelValue" :aria-label="label" :aria-invalid="invalid || undefined" :rows="rows" :placeholder="placeholder" :disabled="disabled" :readonly="readonly" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @keydown="emit('keydown', $event)" @compositionstart="emit('compositionstart')" @compositionend="emit('compositionend')" />
</template>
<style scoped>
textarea { width: 100%; min-height: 4rem; max-height: 14rem; resize: vertical; border: 1px solid var(--p-form-field-border-color); border-radius: var(--p-form-field-border-radius); background: var(--p-form-field-background); color: var(--p-form-field-color); padding: .625rem .75rem; outline: none; line-height: 1.45; }
textarea:focus { border-color: var(--p-form-field-focus-border-color); box-shadow: 0 0 0 2px var(--p-focus-ring-shadow); }
textarea:read-only { background: var(--p-surface-50); color: var(--p-text-muted-color); }
textarea.compact { min-height: var(--tea-control-height, 2.25rem); max-height: 7rem; resize: none; padding-block: .45rem; }
</style>
