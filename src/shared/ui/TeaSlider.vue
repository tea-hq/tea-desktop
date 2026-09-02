<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    min?: number
    max?: number
    step?: number
    valueText?: string
    disabled?: boolean
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    valueText: '',
    disabled: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function updateValue(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, value)))
}
</script>

<template>
  <input
    class="tea-slider h-8 w-full min-w-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
    type="range"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :aria-label="label"
    :aria-valuetext="valueText || undefined"
    :disabled="disabled"
    @input="updateValue"
  />
</template>

<style scoped>
.tea-slider {
  accent-color: var(--tea-accent);
}
</style>
