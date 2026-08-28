<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label: string
    type?: 'text' | 'email' | 'password' | 'search' | 'url'
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
    size?: 'small' | 'default'
    autocomplete?: string
  }>(),
  {
    type: 'text',
    placeholder: '',
    disabled: false,
    invalid: false,
    size: 'default',
    autocomplete: 'off',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    :class="[
      'w-full rounded-control border border-line bg-canvas px-3.5 text-fg outline-none transition-colors placeholder:text-subtle focus:border-fg focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-panel disabled:text-disabled motion-reduce:transition-none',
      size === 'small' ? 'min-h-9 text-sm' : 'min-h-10 text-base',
      invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
    ]"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
