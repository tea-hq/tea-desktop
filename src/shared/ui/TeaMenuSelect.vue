<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref } from 'vue'
import TeaMenu, { type TeaMenuItem } from './TeaMenu.vue'
import type { TeaSelectOption } from './TeaSelect.vue'

const props = withDefaults(
  defineProps<{
    modelValue: T | null
    options: TeaSelectOption<T>[]
    label: string
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
    size?: 'small' | 'default'
  }>(),
  {
    placeholder: '',
    disabled: false,
    invalid: false,
    size: 'default',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: T | null] }>()
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<InstanceType<typeof TeaMenu> | null>(null)
const open = ref(false)
const selectedOption = computed(() =>
  props.options.find((option) => String(option.value) === String(props.modelValue)),
)
const menuItems = computed<TeaMenuItem[]>(() =>
  props.options.map((option) => ({
    value: String(option.value),
    label: option.label,
    disabled: option.disabled,
    selected: String(option.value) === String(props.modelValue),
  })),
)

function showMenu(): void {
  if (props.disabled) return
  open.value = true
  void nextTick(() => {
    const anchor = trigger.value
    if (!anchor) return
    menu.value?.show({ currentTarget: anchor, target: anchor } as unknown as Event)
  })
}

function toggleMenu(): void {
  if (open.value) menu.value?.hide()
  else showMenu()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
    event.preventDefault()
    showMenu()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    showMenu()
  }
}

function selectValue(value: string): void {
  const option = props.options.find((candidate) => String(candidate.value) === value)
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  menu.value?.hide()
}

function hide(): void {
  open.value = false
  void nextTick(() => trigger.value?.focus())
}
</script>

<template>
  <div class="tea-menu-select">
    <button
      ref="trigger"
      type="button"
      role="combobox"
      aria-haspopup="menu"
      :aria-label="label"
      :aria-expanded="open"
      :aria-invalid="invalid || undefined"
      :disabled="disabled"
      :class="[
        'tea-menu-select__trigger inline-flex min-w-0 items-center gap-1 rounded-control border border-transparent bg-transparent text-left text-dim outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-disabled motion-reduce:transition-none',
        size === 'small' ? 'min-h-8 px-2 text-sm' : 'min-h-9 px-2.5 text-base',
        invalid ? 'text-danger focus-visible:outline-danger' : '',
      ]"
      @click="toggleMenu"
      @pointerdown.stop
      @keydown="handleKeydown"
    >
      <span class="min-w-0 flex-1 truncate">
        {{ selectedOption?.label ?? placeholder }}
      </span>
      <span class="i-mdi-chevron-down size-4 shrink-0 text-subtle" aria-hidden="true" />
    </button>
    <TeaMenu
      v-if="open"
      ref="menu"
      :items="menuItems"
      popup
      :label="label"
      @select="selectValue"
      @hide="hide"
    />
  </div>
</template>

<style scoped>
.tea-menu-select {
  min-width: 0;
}
.tea-menu-select__trigger {
  width: 100%;
}
</style>
