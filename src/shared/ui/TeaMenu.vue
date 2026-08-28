<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export interface TeaMenuItem {
  value: string
  label: string
  icon?: string
  disabled?: boolean
  separator?: boolean
}

const props = withDefaults(
  defineProps<{
    items: TeaMenuItem[]
    popup?: boolean
    label: string
  }>(),
  { popup: false },
)
const emit = defineEmits<{ select: [value: string]; hide: [] }>()
const menu = ref<HTMLElement | null>(null)
const itemRefs = ref<Array<HTMLButtonElement | null>>([])
const open = ref(!props.popup)
const position = ref({ top: 0, left: 0 })
const activeIndex = ref(-1)
const focusableIndices = computed(() =>
  props.items
    .map((item, index) => (!item.separator && !item.disabled ? index : -1))
    .filter((index) => index >= 0),
)

function setItemRef(element: Element | null, index: number): void {
  itemRefs.value[index] = element instanceof HTMLButtonElement ? element : null
}

function updatePosition(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  position.value = { top: rect.bottom + 4, left: rect.left }
  void nextTick(() => {
    if (!menu.value) return
    const menuRect = menu.value.getBoundingClientRect()
    position.value = {
      top: Math.min(position.value.top, Math.max(8, window.innerHeight - menuRect.height - 8)),
      left: Math.min(position.value.left, Math.max(8, window.innerWidth - menuRect.width - 8)),
    }
  })
}

function show(event: Event): void {
  const anchor =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : event.target instanceof HTMLElement
        ? event.target
        : null
  if (anchor) updatePosition(anchor)
  open.value = true
  activeIndex.value = focusableIndices.value[0] ?? -1
}

function toggle(event: Event): void {
  if (open.value) hide()
  else show(event)
}

function hide(): void {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  emit('hide')
}

function select(item: TeaMenuItem): void {
  if (item.separator || item.disabled) return
  emit('select', item.value)
  if (props.popup) hide()
}

function focusIndex(index: number): void {
  const next = focusableIndices.value[index]
  if (next === undefined) return
  activeIndex.value = next
  void nextTick(() => itemRefs.value[next]?.focus())
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    hide()
    return
  }
  if (
    event.key === 'ArrowDown' ||
    event.key === 'ArrowUp' ||
    event.key === 'Home' ||
    event.key === 'End'
  ) {
    event.preventDefault()
    if (focusableIndices.value.length === 0) return
    const current = Math.max(0, focusableIndices.value.indexOf(activeIndex.value))
    const next =
      event.key === 'ArrowDown'
        ? (current + 1) % focusableIndices.value.length
        : event.key === 'ArrowUp'
          ? (current - 1 + focusableIndices.value.length) % focusableIndices.value.length
          : event.key === 'Home'
            ? 0
            : focusableIndices.value.length - 1
    focusIndex(next)
  }
}

function handlePointerdown(event: PointerEvent): void {
  if (props.popup && open.value && !menu.value?.contains(event.target as Node)) hide()
}

watch(
  open,
  (value) => {
    if (typeof document === 'undefined') return
    if (value) {
      document.addEventListener('keydown', handleKeydown)
      document.addEventListener('pointerdown', handlePointerdown)
    } else {
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('pointerdown', handlePointerdown)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('pointerdown', handlePointerdown)
  }
})

defineExpose({ toggle, show, hide })
</script>

<template>
  <div
    v-if="open"
    ref="menu"
    role="menu"
    :aria-label="label"
    :class="[
      'z-50 min-w-52 overflow-y-auto rounded-menu border border-line bg-raised p-1 text-fg',
      popup ? 'fixed' : 'relative',
    ]"
    :style="popup ? { top: `${position.top}px`, left: `${position.left}px` } : undefined"
  >
    <template
      v-for="(item, index) in items"
      :key="item.separator ? `separator-${index}` : item.value"
    >
      <div v-if="item.separator" class="my-1 h-px bg-line" role="separator" />
      <button
        v-else
        :ref="(element) => setItemRef(element as Element | null, index)"
        type="button"
        role="menuitem"
        :disabled="item.disabled"
        :tabindex="activeIndex === index ? 0 : -1"
        class="flex min-h-9 w-full items-center gap-2 rounded-menu px-2.5 text-left text-sm text-dim transition-colors hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        @click="select(item)"
      >
        <span v-if="item.icon" :class="[item.icon, 'size-4 shrink-0']" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      </button>
    </template>
  </div>
</template>
