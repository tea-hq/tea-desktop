<script setup lang="ts" generic="T extends string | number">
import TeaMenuSelect from './TeaMenuSelect.vue'
import type { TeaSelectOption } from './selectTypes'

export type { TeaSelectOption } from './selectTypes'

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
  <TeaMenuSelect
    :model-value="modelValue"
    :options="options"
    :label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :invalid="invalid"
    :size="size"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
