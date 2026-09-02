<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton } from '@/shared/ui'
import type { ChannelMediaSaveState } from '../contracts'

const props = withDefaults(
  defineProps<{
    state?: ChannelMediaSaveState | null
    available?: boolean
    interactive?: boolean
  }>(),
  { state: null, available: false, interactive: true },
)
const emit = defineEmits<{ save: []; cancel: []; retry: [] }>()
const { t } = useI18n()

const status = computed(() => props.state?.status ?? 'idle')
const pending = computed(() => status.value === 'choosing' || status.value === 'saving')
const label = computed(() => {
  if (pending.value) return t('channels.message.media.cancelSave')
  if (status.value === 'failed') return t('channels.message.media.retrySave')
  if (status.value === 'saved') return t('channels.message.media.saveAgain')
  return t('channels.message.media.save')
})
const icon = computed(() => {
  if (pending.value) return 'i-mdi-close'
  if (status.value === 'failed') return 'i-mdi-refresh'
  if (status.value === 'saved') return 'i-mdi-check'
  return 'i-mdi-download-outline'
})
const disabled = computed(
  () =>
    !props.available ||
    !props.interactive ||
    (status.value === 'failed' && !props.state?.retryable),
)
const announcement = computed(() => {
  if (status.value === 'choosing') return t('channels.message.media.choosing')
  if (status.value === 'saving') {
    const total = props.state?.totalBytes
    const received = props.state?.receivedBytes ?? 0
    const progress = total ? Math.min(100, Math.round((received / total) * 100)) : null
    return progress === null
      ? t('channels.message.media.saving')
      : t('channels.message.media.savingProgress', { progress })
  }
  if (status.value === 'saved')
    return t('channels.message.media.saved', { name: props.state?.fileName ?? '' })
  if (status.value === 'cancelled') return t('channels.message.media.cancelled')
  if (status.value === 'failed')
    return t('channels.message.media.failed', { code: props.state?.errorCode ?? 'unknown' })
  return ''
})

function activate(): void {
  if (pending.value) emit('cancel')
  else if (status.value === 'failed') emit('retry')
  else emit('save')
}
</script>

<template>
  <span class="inline-flex shrink-0" data-media-save-control @click.stop>
    <TeaIconButton
      size="small"
      appearance="ghost"
      :label="label"
      :icon="icon"
      :disabled="disabled"
      @click="activate"
    />
    <span v-if="announcement" class="sr-only" role="status" aria-live="polite">
      {{ announcement }}
    </span>
  </span>
</template>
