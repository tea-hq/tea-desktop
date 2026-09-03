<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { calculateFloatingMenuPosition } from '@/shared/ui/menuPosition'
import type { QuickCommentOption } from '../quickCommentOptions'

const props = withDefaults(
  defineProps<{
    open: boolean
    options: readonly QuickCommentOption[]
    activeTypes?: readonly number[]
    pending?: boolean
    placement?: 'auto' | 'up' | 'down'
    alignEnd?: boolean
  }>(),
  { activeTypes: () => [], pending: false, placement: 'auto', alignEnd: false },
)
const emit = defineEmits<{
  close: []
  select: [type: number]
}>()
const { t } = useI18n()
const picker = ref<HTMLElement | null>(null)
const position = ref({ top: 0, left: 0 })
const positioned = ref(false)

function isActive(type: number): boolean {
  return props.activeTypes.includes(type)
}

function onDocumentPointerdown(event: PointerEvent): void {
  if (
    !event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          (node.dataset.quickCommentPicker === 'true' ||
            node.dataset.quickCommentTrigger === 'true'),
      )
  )
    emit('close')
}

function updatePosition(): void {
  if (!props.open) return
  void nextTick(() => {
    const element = picker.value
    const anchor = element?.parentElement
    if (!element || !anchor || typeof window === 'undefined') return

    const anchorRect = anchor.getBoundingClientRect()
    const pickerRect = element.getBoundingClientRect()
    const nextPosition = calculateFloatingMenuPosition(
      anchorRect,
      { width: pickerRect.width, height: pickerRect.height },
      { width: window.innerWidth, height: window.innerHeight },
      {
        alignEnd: props.alignEnd,
        preferUp: props.placement !== 'down',
        gap: 8,
      },
    )
    position.value = nextPosition
    positioned.value = true
  })
}

watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      positioned.value = false
      document.addEventListener('pointerdown', onDocumentPointerdown)
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
      }
      updatePosition()
    } else {
      document.removeEventListener('pointerdown', onDocumentPointerdown)
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined')
    document.removeEventListener('pointerdown', onDocumentPointerdown)
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
  }
})
</script>

<template>
  <div
    v-if="open"
    ref="picker"
    class="channel-quick-comment-picker fixed z-50 w-[min(28rem,calc(100vw-1rem))] overflow-hidden rounded-overlay border border-line bg-raised p-2"
    :style="{
      top: `${position.top}px`,
      left: `${position.left}px`,
      visibility: positioned ? 'visible' : 'hidden',
    }"
    role="dialog"
    :aria-label="t('channels.message.quickReaction')"
    data-quick-comment-picker="true"
    @click.stop
    @keydown.esc="emit('close')"
  >
    <div
      class="channel-quick-comment-picker__grid max-h-[min(22rem,calc(100vh-2rem))] overflow-y-auto p-1"
      role="listbox"
    >
      <button
        v-for="option in options"
        :key="option.type"
        type="button"
        class="channel-quick-comment-picker__option inline-flex size-10 items-center justify-center rounded-control border border-transparent transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus active:bg-pressed disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
        :class="isActive(option.type) ? 'bg-accent/10 ring-1 ring-accent/25' : ''"
        :aria-label="t('channels.message.reactWith', { name: option.name })"
        :aria-pressed="isActive(option.type)"
        :disabled="pending"
        :data-quick-comment-type="option.type"
        role="option"
        @click="emit('select', option.type)"
      >
        <img class="size-7 object-contain" :src="option.asset" :alt="option.name" loading="lazy" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.channel-quick-comment-picker {
  box-shadow: var(--tea-shadow-overlay);
}

.channel-quick-comment-picker__grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 2px;
}

@media (max-width: 480px) {
  .channel-quick-comment-picker__grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}
</style>
