<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    dismissable?: boolean
    width?: 'default' | 'wide'
    closeLabel?: string
  }>(),
  { dismissable: true, width: 'default', closeLabel: 'Close' },
)
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
const titleId = `tea-drawer-title-${Math.random().toString(36).slice(2)}`
let previousActive: HTMLElement | null = null
let previousOverflow = ''

function setOpen(open: boolean): void {
  if (typeof document === 'undefined') return
  if (open) {
    previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    void nextTick(() => panel.value?.focus())
  } else {
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
  setOpen(false)
})
</script>

<template>
  <Teleport v-if="open" to="body">
    <div class="fixed inset-0 z-40" @click="dismissOnBackdrop">
      <div class="absolute inset-0 bg-inverse/20" aria-hidden="true" />
      <aside
        ref="panel"
        :aria-labelledby="titleId"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :class="[
          'absolute inset-y-0 right-0 flex w-full max-w-[92vw] flex-col bg-raised text-fg shadow-overlay outline-none',
          width === 'wide' ? 'max-w-2xl' : 'max-w-lg',
        ]"
        @click.stop
      >
        <header
          class="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4"
        >
          <h2 :id="titleId" class="min-w-0 truncate text-base font-semibold">{{ title }}</h2>
          <button
            type="button"
            class="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-dim transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent motion-reduce:transition-none"
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
          class="flex shrink-0 justify-end gap-2 border-t border-line bg-surface px-5 py-4"
        >
          <slot name="footer" />
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
