<script setup lang="ts">
defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
<template>
  <div class="nav-pill-group" role="radiogroup">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :disabled="option.disabled"
      class="nav-pill-group__item"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
