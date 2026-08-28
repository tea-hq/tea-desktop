<script setup lang="ts">
defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
<template>
  <div class="inline-flex rounded-control bg-panel p-1" role="radiogroup">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :disabled="option.disabled"
      class="rounded-control px-3 py-1.5 text-sm font-medium text-dim transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
      :class="modelValue === option.value ? 'bg-inverse text-canvas' : ''"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
