<script setup lang="ts">
defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
<template>
  <div class="inline-flex rounded-control bg-muted p-1" role="radiogroup">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :disabled="option.disabled"
      class="rounded-structural px-3 py-1.5 text-xs font-medium text-dim transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
      :class="modelValue === option.value ? 'bg-raised text-fg shadow-sm' : ''"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
