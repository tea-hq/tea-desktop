<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaDialog, TeaIconButton } from '@/shared/ui'
import type { ChannelMediaSaveState, Message } from '../contracts'
import ChannelMediaSaveControl from './ChannelMediaSaveControl.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    message?: Message | null
    canGoPrevious?: boolean
    canGoNext?: boolean
    saveState?: ChannelMediaSaveState | null
    savingAvailable?: boolean
  }>(),
  {
    message: null,
    canGoPrevious: false,
    canGoNext: false,
    saveState: null,
    savingAvailable: false,
  },
)
const emit = defineEmits<{
  close: []
  previous: []
  next: []
  save: []
  cancelSave: []
  retrySave: []
}>()
const { t } = useI18n()
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
const renderGeneration = ref(0)

const media = computed(() => {
  const content = props.message?.content
  return content?.kind === 'image' || content?.kind === 'video' ? content : null
})
const sourceUrl = computed(() => media.value?.media.url?.trim() ?? '')
const mediaName = computed(
  () => media.value?.media.name?.trim() || props.message?.text || t('channels.message.image'),
)
const title = computed(() => t('channels.message.media.viewerTitle', { name: mediaName.value }))
const sizeText = computed(() => formatBytes(media.value?.media.size))

watch(
  () => [props.open, props.message?.ref.messageClientId, sourceUrl.value] as const,
  ([open]) => {
    if (open) loadState.value = 'loading'
  },
  { immediate: true },
)
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
})

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  if (event.target instanceof HTMLVideoElement) return
  if (event.key === 'ArrowLeft' && props.canGoPrevious) {
    event.preventDefault()
    emit('previous')
  } else if (event.key === 'ArrowRight' && props.canGoNext) {
    event.preventDefault()
    emit('next')
  }
}

function retryLoad(): void {
  loadState.value = 'loading'
  renderGeneration.value += 1
}

function formatBytes(value: number | undefined): string {
  if (!Number.isFinite(value) || value === undefined || value < 0) return ''
  if (value < 1_024) return `${Math.round(value)} B`
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`
  return `${(value / 1_073_741_824).toFixed(1)} GB`
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="title"
    :close-label="t('common.close')"
    width="large"
    dismissable
    @close="emit('close')"
  >
    <div
      class="relative flex min-h-[min(65vh,36rem)] items-center justify-center overflow-hidden rounded-card bg-panel"
      data-media-viewer-stage
    >
      <div
        v-if="loadState === 'loading'"
        class="absolute inset-0 z-10 flex items-center justify-center text-sm text-subtle"
        role="status"
        aria-live="polite"
      >
        <span
          class="i-mdi-loading mr-2 size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {{ t('channels.message.media.loading') }}
      </div>
      <div
        v-else-if="loadState === 'failed'"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center"
        role="alert"
      >
        <span class="i-mdi-image-broken-variant size-8 text-subtle" aria-hidden="true" />
        <p class="text-sm text-dim">{{ t('channels.message.media.loadFailed') }}</p>
        <TeaButton size="small" @click="retryLoad">
          <span class="i-mdi-refresh size-4" aria-hidden="true" />
          {{ t('channels.message.media.retryLoad') }}
        </TeaButton>
      </div>
      <img
        v-if="media?.kind === 'image' && sourceUrl"
        :key="`${sourceUrl}:${renderGeneration}`"
        class="max-h-[min(65vh,36rem)] max-w-full object-contain"
        :class="loadState === 'ready' ? 'opacity-100' : 'opacity-0'"
        :src="sourceUrl"
        :alt="mediaName"
        @load="loadState = 'ready'"
        @error="loadState = 'failed'"
      />
      <video
        v-else-if="media?.kind === 'video' && sourceUrl"
        :key="`${sourceUrl}:${renderGeneration}`"
        class="max-h-[min(65vh,36rem)] max-w-full"
        :class="loadState === 'ready' ? 'opacity-100' : 'opacity-0'"
        :src="sourceUrl"
        controls
        preload="metadata"
        @loadedmetadata="loadState = 'ready'"
        @error="loadState = 'failed'"
      />
    </div>

    <template #footer>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <div class="flex shrink-0 items-center gap-1">
          <TeaIconButton
            size="small"
            :label="t('channels.message.media.previous')"
            icon="i-mdi-chevron-left"
            :disabled="!canGoPrevious"
            @click="emit('previous')"
          />
          <TeaIconButton
            size="small"
            :label="t('channels.message.media.next')"
            icon="i-mdi-chevron-right"
            :disabled="!canGoNext"
            @click="emit('next')"
          />
        </div>
        <div class="min-w-0 flex-1 px-1">
          <p class="truncate text-sm font-medium text-fg">{{ mediaName }}</p>
          <p v-if="sizeText" class="text-xs text-subtle">{{ sizeText }}</p>
        </div>
        <ChannelMediaSaveControl
          :state="saveState"
          :available="savingAvailable"
          @save="emit('save')"
          @cancel="emit('cancelSave')"
          @retry="emit('retrySave')"
        />
      </div>
    </template>
  </TeaDialog>
</template>
