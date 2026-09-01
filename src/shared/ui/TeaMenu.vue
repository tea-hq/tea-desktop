<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { calculateFloatingMenuPosition } from './menuPosition'

export interface TeaMenuItem {
  value: string
  label: string
  icon?: string
  title?: string
  danger?: boolean
  disabled?: boolean
  selected?: boolean
  separator?: boolean
}

export type TeaMenuPlacement = 'down' | 'up'

const MENU_GAP = 4
const VIEWPORT_GUTTER = 8

const props = withDefaults(
  defineProps<{
    items: TeaMenuItem[]
    popup?: boolean
    label: string
    placement?: TeaMenuPlacement
    minWidth?: number
  }>(),
  { popup: false, placement: 'down', minWidth: undefined },
)
const emit = defineEmits<{ select: [value: string]; hide: [] }>()
const menu = ref<HTMLElement | null>(null)
const anchor = ref<HTMLElement | null>(null)
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

function updatePosition(anchorElement: HTMLElement | null = anchor.value): void {
  if (!anchorElement || !props.popup) return
  anchor.value = anchorElement
  const rect = anchorElement.getBoundingClientRect()
  const initialTop = props.placement === 'up' ? rect.top - MENU_GAP : rect.bottom + MENU_GAP
  position.value = {
    top: Math.max(VIEWPORT_GUTTER, initialTop),
    left: Math.max(VIEWPORT_GUTTER, rect.left),
  }

  const positionAfterMeasure = (): void => {
    if (!menu.value) return
    const menuRect = menu.value.getBoundingClientRect()
    const nextPosition = calculateFloatingMenuPosition(
      rect,
      { width: menuRect.width, height: menuRect.height },
      { width: window.innerWidth, height: window.innerHeight },
      { alignEnd: false, preferUp: props.placement === 'up', gap: MENU_GAP },
    )
    position.value = nextPosition
  }

  // The popup is rendered by v-if after `open` changes; wait for that DOM pass
  // before measuring its size so menus near an edge are placed and clamped correctly.
  void nextTick(positionAfterMeasure)
}

function show(event: Event): void {
  const anchor =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : event.target instanceof HTMLElement
        ? event.target
        : null
  open.value = true
  if (anchor) updatePosition(anchor)
  activeIndex.value = focusableIndices.value[0] ?? -1
  void nextTick(() => itemRefs.value[activeIndex.value]?.focus())
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

function handleViewportChange(): void {
  if (open.value) updatePosition()
}

watch(
  open,
  (value) => {
    if (typeof document === 'undefined') return
    if (value) {
      document.addEventListener('keydown', handleKeydown)
      document.addEventListener('pointerdown', handlePointerdown)
      if (props.popup && typeof window !== 'undefined') {
        window.addEventListener('resize', handleViewportChange)
        window.addEventListener('scroll', handleViewportChange, true)
      }
    } else {
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('pointerdown', handlePointerdown)
      if (props.popup && typeof window !== 'undefined') {
        window.removeEventListener('resize', handleViewportChange)
        window.removeEventListener('scroll', handleViewportChange, true)
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('pointerdown', handlePointerdown)
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
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
      'z-50 min-w-52 max-h-[calc(100vh-1rem)] overflow-y-auto rounded-menu border border-line bg-raised p-1 text-fg',
      popup ? 'fixed' : 'relative',
    ]"
    :style="
      popup
        ? {
            top: `${position.top}px`,
            left: `${position.left}px`,
            ...(minWidth ? { minWidth: `${minWidth}px` } : {}),
          }
        : undefined
    "
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
        :role="item.selected ? 'menuitemradio' : 'menuitem'"
        :disabled="item.disabled"
        :title="item.title"
        :aria-checked="item.selected || undefined"
        :tabindex="activeIndex === index ? 0 : -1"
        :class="[
          'flex min-h-9 w-full items-center gap-2 rounded-menu px-2.5 text-left text-sm transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
          item.danger
            ? 'text-danger hover:bg-danger-subtle focus-visible:bg-danger-subtle'
            : 'text-dim hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg',
        ]"
        @click="select(item)"
      >
        <span v-if="item.icon" :class="[item.icon, 'size-4 shrink-0']" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        <span v-if="item.selected" class="i-mdi-check size-4 shrink-0" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>
