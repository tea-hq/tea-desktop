<script setup lang="ts">
defineProps<{ modelValue: string; options: Array<{ value: string; label: string; disabled?: boolean }> }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
<template>
  <div class="inline-flex rounded-lg bg-gray-100 p-1" role="radiogroup">
    <button v-for="option in options" :key="option.value" type="button" role="radio" :aria-checked="modelValue === option.value" :disabled="option.disabled" class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-40" :class="modelValue === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'" @click="emit('update:modelValue', option.value)">{{ option.label }}</button>
  </div>
</template>
