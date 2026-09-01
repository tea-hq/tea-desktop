<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref } from 'vue'
import TeaMenu, { type TeaMenuItem, type TeaMenuPlacement } from './TeaMenu.vue'
import type { TeaSelectOption } from './selectTypes'

const props = withDefaults(
  defineProps<{
    modelValue: T | null
    options: TeaSelectOption<T>[]
    label: string
    icon?: string
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
    size?: 'small' | 'default'
    appearance?: 'menu' | 'field'
    menuPlacement?: TeaMenuPlacement
  }>(),
  {
    placeholder: '',
    icon: '',
    disabled: false,
    invalid: false,
    size: 'default',
    appearance: 'menu',
    menuPlacement: 'down',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: T | null] }>()
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<InstanceType<typeof TeaMenu> | null>(null)
const open = ref(false)
const menuMinWidth = ref<number | undefined>()
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
    const width = anchor.getBoundingClientRect().width
    menuMinWidth.value = props.appearance === 'field' && width > 0 ? width : undefined
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
        'tea-menu-select__trigger inline-flex min-w-0 items-center gap-1 rounded-control text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed motion-reduce:transition-none',
        appearance === 'field'
          ? 'min-h-10 border border-line bg-canvas px-3.5 text-fg hover:bg-panel focus-visible:border-fg focus-visible:bg-canvas focus-visible:text-fg disabled:bg-panel disabled:text-disabled'
          : 'min-h-9 border border-transparent bg-transparent px-2.5 text-dim hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-focus disabled:text-disabled',
        size === 'small' && 'min-h-8 px-2 text-sm',
        invalid ? 'text-danger focus-visible:outline-danger' : '',
      ]"
      @click="toggleMenu"
      @pointerdown.stop
      @keydown="handleKeydown"
    >
      <span v-if="icon" :class="[icon, 'size-4 shrink-0 text-subtle']" aria-hidden="true" />
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
      :placement="menuPlacement"
      :min-width="menuMinWidth"
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
