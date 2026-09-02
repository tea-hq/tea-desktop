<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton, TeaMenuSelect, TeaSlider, type TeaSelectOption } from '@/shared/ui'
import type { ChannelVoicePlaybackRate, ChannelVoicePlaybackState } from '../contracts'

const props = withDefaults(
  defineProps<{
    playback?: ChannelVoicePlaybackState | null
    durationMs?: number
    playbackRate?: ChannelVoicePlaybackRate
    interactive?: boolean
  }>(),
  {
    playback: null,
    durationMs: 0,
    playbackRate: 1,
    interactive: true,
  },
)

const emit = defineEmits<{
  toggle: []
  retry: []
  seek: [positionMs: number]
  rate: [rate: ChannelVoicePlaybackRate]
}>()
const { t } = useI18n()
const rateOptions: TeaSelectOption<ChannelVoicePlaybackRate>[] = [
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
]

const status = computed(() => props.playback?.status ?? 'paused')
const duration = computed(() => Math.max(0, props.playback?.durationMs || props.durationMs))
const position = computed(() =>
  Math.min(duration.value || Number.MAX_SAFE_INTEGER, Math.max(0, props.playback?.positionMs ?? 0)),
)
const rate = computed(() => props.playback?.playbackRate ?? props.playbackRate)
const actionLabel = computed(() => {
  if (status.value === 'loading') return t('channels.message.voice.cancelPlaybackLoading')
  if (status.value === 'playing') return t('channels.message.voice.pausePlayback')
  if (status.value === 'failed') return t('channels.message.voice.retryPlayback')
  return t('channels.message.voice.play')
})
const actionIcon = computed(() => {
  if (status.value === 'loading') return 'i-mdi-loading animate-spin motion-reduce:animate-none'
  if (status.value === 'playing') return 'i-mdi-pause'
  if (status.value === 'failed') return 'i-mdi-refresh'
  return 'i-mdi-play'
})
const actionDisabled = computed(
  () => !props.interactive || (status.value === 'failed' && !props.playback?.retryable),
)
const positionText = computed(() => `${formatTime(position.value)} / ${formatTime(duration.value)}`)

function activate(): void {
  if (status.value === 'failed') emit('retry')
  else emit('toggle')
}

function updateRate(value: ChannelVoicePlaybackRate | null): void {
  if (value !== null) emit('rate', value)
}

function formatTime(value: number): string {
  const seconds = Math.floor(Math.max(0, value) / 1_000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="w-72 max-w-full" data-voice-player>
    <div class="flex min-w-0 items-center gap-2">
      <TeaIconButton
        size="small"
        appearance="secondary"
        :label="actionLabel"
        :icon="actionIcon"
        :disabled="actionDisabled"
        @click="activate"
      />
      <div class="flex min-w-0 flex-1 flex-col">
        <TeaSlider
          :model-value="position"
          :min="0"
          :max="Math.max(1, duration)"
          :step="250"
          :label="t('channels.message.voice.position')"
          :value-text="positionText"
          :disabled="!interactive || status === 'loading' || status === 'failed'"
          @update:model-value="emit('seek', $event)"
        />
        <div class="flex min-w-0 items-center justify-between gap-2">
          <span class="shrink-0 text-xs tabular-nums text-subtle">{{ positionText }}</span>
          <TeaMenuSelect
            class="w-16 shrink-0"
            size="small"
            menu-placement="up"
            :model-value="rate"
            :options="rateOptions"
            :label="t('channels.message.voice.speed')"
            :disabled="!interactive"
            @update:model-value="updateRate"
          />
        </div>
      </div>
    </div>
    <span v-if="status === 'loading'" class="sr-only" role="status" aria-live="polite">
      {{ t('channels.message.voice.playbackLoading') }}
    </span>
    <p
      v-else-if="status === 'failed'"
      class="mt-1 min-w-0 break-words text-xs text-danger"
      role="alert"
    >
      {{
        t('channels.message.voice.playbackFailed', {
          code: playback?.errorCode || 'unknown',
        })
      }}
    </p>
  </div>
</template>
