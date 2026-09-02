<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    label: string
    disabled?: boolean
    showLabel?: boolean
  }>(),
  { disabled: false, showLabel: true },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function update(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label
    class="inline-flex min-w-0 items-center gap-2 text-sm"
    :class="disabled ? 'cursor-not-allowed text-disabled' : 'cursor-pointer text-fg'"
  >
    <input
      type="checkbox"
      class="size-4 shrink-0 accent-accent outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="label"
      @change="update"
    />
    <slot v-if="$slots.default" />
    <span v-else-if="showLabel" class="min-w-0 truncate">{{ label }}</span>
  </label>
</template>
