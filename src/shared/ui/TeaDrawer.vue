<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    dismissable?: boolean
    width?: 'default' | 'wide'
    appearance?: 'default' | 'quiet'
    closeLabel?: string
    resizable?: boolean
    defaultWidth?: number
    minWidth?: number
    maxWidth?: number
    resizeLabel?: string
    showHeader?: boolean
  }>(),
  {
    dismissable: true,
    width: 'default',
    appearance: 'default',
    closeLabel: 'Close',
    resizable: false,
    defaultWidth: 560,
    minWidth: 360,
    maxWidth: 760,
    resizeLabel: 'Resize drawer',
    showHeader: true,
  },
)
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
const titleId = `tea-drawer-title-${Math.random().toString(36).slice(2)}`
const panelId = `tea-drawer-panel-${Math.random().toString(36).slice(2)}`
const panelWidth = ref(clamp(props.defaultWidth, props.minWidth, props.maxWidth))
const resizing = ref(false)
let previousActive: HTMLElement | null = null
let previousOverflow = ''
let previousCursor = ''
let previousUserSelect = ''
let resizePointerId: number | null = null
let resizeStartX = 0
let resizeStartWidth = 0

const panelStyle = computed(() => ({
  width: `${panelWidth.value}px`,
  maxWidth: `min(92vw, ${props.maxWidth}px)`,
}))

function availableMaxWidth(): number {
  if (typeof window === 'undefined') return props.maxWidth
  return Math.max(props.minWidth, Math.floor(window.innerWidth * 0.92))
}

function clampWidth(value: number): number {
  return clamp(value, props.minWidth, Math.min(props.maxWidth, availableMaxWidth()))
}

function updateWidth(value: number): void {
  panelWidth.value = clampWidth(value)
}

function startResize(event: PointerEvent): void {
  if (!props.resizable || (event.button !== 0 && event.button !== -1)) return
  event.preventDefault()
  resizePointerId = event.pointerId
  resizeStartX = event.clientX
  resizeStartWidth = panelWidth.value
  resizing.value = true
  previousCursor = document.documentElement.style.cursor
  previousUserSelect = document.documentElement.style.userSelect
  document.documentElement.style.cursor = 'col-resize'
  document.documentElement.style.userSelect = 'none'
  window.addEventListener('pointermove', handleResize)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}

function handleResize(event: PointerEvent): void {
  if (!resizing.value) return
  if (resizePointerId !== null && event.pointerId !== resizePointerId) return
  updateWidth(resizeStartWidth - (event.clientX - resizeStartX))
}

function stopResize(): void {
  if (!resizing.value) return
  resizing.value = false
  resizePointerId = null
  document.documentElement.style.cursor = previousCursor
  document.documentElement.style.userSelect = previousUserSelect
  window.removeEventListener('pointermove', handleResize)
  window.removeEventListener('pointerup', stopResize)
  window.removeEventListener('pointercancel', stopResize)
}

function handleResizeKeydown(event: KeyboardEvent): void {
  if (!props.resizable) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    updateWidth(panelWidth.value + 16)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    updateWidth(panelWidth.value - 16)
  } else if (event.key === 'Home') {
    event.preventDefault()
    updateWidth(props.minWidth)
  } else if (event.key === 'End') {
    event.preventDefault()
    updateWidth(props.maxWidth)
  }
}

function setOpen(open: boolean): void {
  if (typeof document === 'undefined') return
  if (open) {
    previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    void nextTick(() => panel.value?.focus())
  } else {
    stopResize()
    document.body.style.overflow = previousOverflow
    previousActive?.focus()
    previousActive = null
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab' && props.open && panel.value) {
    const focusable = Array.from(
      panel.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    )
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  if (event.key === 'Escape' && props.open && props.dismissable) {
    event.preventDefault()
    emit('close')
  }
}

function dismissOnBackdrop(): void {
  if (props.dismissable) emit('close')
}

watch(() => props.open, setOpen, { immediate: true })
watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) document.addEventListener('keydown', handleKeydown)
    else document.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', handleKeydown)
  stopResize()
  setOpen(false)
})

watch(
  () => [props.defaultWidth, props.minWidth, props.maxWidth] as const,
  ([defaultWidth, minWidth, maxWidth], previous) => {
    if (!previous || panelWidth.value === clamp(previous[0], previous[1], previous[2])) {
      panelWidth.value = clamp(defaultWidth, minWidth, maxWidth)
      return
    }
    updateWidth(panelWidth.value)
  },
)
watch(
  () => props.open,
  (open) => {
    if (typeof window === 'undefined' || !props.resizable) return
    if (open) window.addEventListener('resize', constrainWidth)
    else window.removeEventListener('resize', constrainWidth)
  },
  { immediate: true },
)

function constrainWidth(): void {
  updateWidth(panelWidth.value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
</script>

<template>
  <Teleport v-if="open" to="body">
    <div class="fixed inset-0 z-40" @click="dismissOnBackdrop">
      <div class="absolute inset-0 bg-inverse/30" aria-hidden="true" />
      <aside
        :id="panelId"
        ref="panel"
        :aria-labelledby="titleId"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :class="[
          'tea-drawer__panel absolute inset-y-0 right-0 flex w-full max-w-[92vw] flex-col bg-raised text-fg outline-none',
          appearance === 'quiet' ? 'border-l-0' : 'border-l border-line',
          resizable ? '' : width === 'wide' ? 'max-w-2xl' : 'max-w-lg',
        ]"
        :style="resizable ? panelStyle : undefined"
        @click.stop
      >
        <div
          v-if="resizable"
          class="tea-drawer__resize-handle"
          role="separator"
          aria-orientation="vertical"
          :aria-controls="panelId"
          :aria-label="resizeLabel"
          :aria-valuemin="minWidth"
          :aria-valuemax="maxWidth"
          :aria-valuenow="Math.round(panelWidth)"
          :aria-valuetext="`${Math.round(panelWidth)} px`"
          tabindex="0"
          @pointerdown="startResize"
          @keydown="handleResizeKeydown"
        >
          <span aria-hidden="true" />
        </div>
        <h2 v-if="!showHeader" :id="titleId" class="sr-only">{{ title }}</h2>
        <header
          v-if="showHeader"
          :class="[
            'flex shrink-0 items-center justify-between gap-4 border-b border-line-soft bg-raised px-5 py-4',
            appearance === 'quiet' ? '' : 'border-line',
          ]"
        >
          <h2 :id="titleId" class="min-w-0 truncate text-base font-semibold">{{ title }}</h2>
          <button
            type="button"
            class="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-dim transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus motion-reduce:transition-none"
            :aria-label="closeLabel"
            :title="closeLabel"
            @click="emit('close')"
          >
            <span class="i-mdi-close size-5" aria-hidden="true" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto"><slot /></div>
        <footer
          v-if="$slots.footer"
          class="flex shrink-0 justify-end gap-2 border-t border-line bg-canvas px-5 py-4"
        >
          <slot name="footer" />
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.tea-drawer__resize-handle {
  position: absolute;
  z-index: 1;
  top: 0;
  bottom: 0;
  left: -0.5rem;
  display: flex;
  width: 1rem;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}

.tea-drawer__resize-handle span {
  width: 2px;
  height: 3rem;
  border-radius: var(--tea-radius-pill);
  background: transparent;
  transition: background-color 150ms ease;
}

.tea-drawer__resize-handle:hover span,
.tea-drawer__resize-handle:focus-visible span {
  background: var(--tea-line-strong);
}

.tea-drawer__resize-handle:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: -1px;
}

@media (max-width: 40rem) {
  .tea-drawer__panel {
    width: 100% !important;
    max-width: 100% !important;
  }

  .tea-drawer__resize-handle {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tea-drawer__resize-handle span {
    transition: none;
  }
}
</style>
