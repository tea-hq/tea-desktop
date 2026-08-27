<script setup lang="ts">
import InputText from 'primevue/inputtext'

withDefaults(defineProps<{
  modelValue: string
  label: string
  type?: 'text' | 'email' | 'password' | 'search' | 'url'
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  size?: 'small' | 'default'
  autocomplete?: string
}>(), {
  type: 'text',
  placeholder: '',
  disabled: false,
  invalid: false,
  size: 'default',
  autocomplete: 'off',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <InputText
    :model-value="modelValue"
    :aria-label="label"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :invalid="invalid"
    :size="size === 'small' ? 'small' : undefined"
    :autocomplete="autocomplete"
    fluid
    @update:model-value="emit('update:modelValue', $event ?? '')"
  />
</template>
