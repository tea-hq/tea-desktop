<script setup lang="ts" generic="T extends string | number">
import Select from 'primevue/select'

export interface TeaSelectOption<TValue extends string | number = string> {
  value: TValue
  label: string
  disabled?: boolean
}

withDefaults(
  defineProps<{
    modelValue: T | null
    options: TeaSelectOption<T>[]
    label: string
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
    filter?: boolean
    size?: 'small' | 'default'
  }>(),
  {
    placeholder: '',
    disabled: false,
    invalid: false,
    filter: false,
    size: 'default',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: T | null] }>()
</script>

<template>
  <Select
    :model-value="modelValue"
    :options="options"
    option-label="label"
    option-value="value"
    option-disabled="disabled"
    :aria-label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :invalid="invalid"
    :filter="filter"
    :size="size === 'small' ? 'small' : undefined"
    fluid
    @update:model-value="emit('update:modelValue', $event as T | null)"
  />
</template>
