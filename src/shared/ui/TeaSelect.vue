<script setup lang="ts" generic="T extends string | number">
export interface TeaSelectOption<TValue extends string | number = string> {
  value: TValue
  label: string
  disabled?: boolean
}

const props = withDefaults(
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

function selectValue(event: Event): void {
  const select = event.target as HTMLSelectElement
  const option = props.options[select.selectedIndex - (props.placeholder ? 1 : 0)]
  emit('update:modelValue', option?.value ?? null)
}
</script>

<template>
  <select
    :value="modelValue == null ? '' : String(modelValue)"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="[
      'w-full rounded-control border border-line bg-canvas px-4 text-fg outline-none transition-colors focus:border-fg focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-panel disabled:text-disabled motion-reduce:transition-none',
      size === 'small' ? 'min-h-9 text-sm' : 'min-h-10 text-base',
      invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
    ]"
    @change="selectValue"
  >
    <option v-if="placeholder" value="" :disabled="modelValue !== null">{{ placeholder }}</option>
    <option
      v-for="option in options"
      :key="String(option.value)"
      :value="String(option.value)"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>
