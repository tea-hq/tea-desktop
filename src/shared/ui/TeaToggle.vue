<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    label: string
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-label="label"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="tea-toggle relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
    :class="modelValue ? 'bg-success' : 'bg-surface-strong'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute top-0.5 size-4 rounded-full bg-canvas transition-transform motion-reduce:transition-none"
      :class="modelValue ? 'translate-x-4' : 'translate-x-0.5'"
    />
  </button>
</template>
