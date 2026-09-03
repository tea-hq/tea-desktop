<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import { TeaIconButton } from '@/shared/ui'
import type { OutgoingMessageAttempt } from '../contracts'

defineProps<{ attempt: OutgoingMessageAttempt }>()
const emit = defineEmits<{ retry: []; cancel: []; dismiss: [] }>()
const { t } = useI18n()

function isMediaContent(
  content: OutgoingMessageAttempt['content'],
): content is Extract<
  OutgoingMessageAttempt['content'],
  { kind: 'image' | 'audio' | 'video' | 'file' }
> {
  return (
    content.kind === 'image' ||
    content.kind === 'audio' ||
    content.kind === 'video' ||
    content.kind === 'file'
  )
}

function contentIcon(content: OutgoingMessageAttempt['content']): string {
  if (content.kind === 'image') return 'i-mdi-image-outline'
  if (content.kind === 'audio') return 'i-mdi-music-note-outline'
  if (content.kind === 'video') return 'i-mdi-video-outline'
  if (content.kind === 'file') return 'i-mdi-file-outline'
  return 'i-mdi-message-text-outline'
}

function contentText(content: OutgoingMessageAttempt['content']): string {
  if (content.kind === 'text') return content.text
  if (isMediaContent(content)) return content.caption ?? ''
  if ('text' in content && typeof content.text === 'string') return content.text
  if (content.kind === 'location') return content.address
  return ''
}
</script>

<template>
  <article
    class="channel-outgoing-message flex justify-end px-5 py-1.5"
    :data-outgoing-attempt-id="attempt.attemptId"
    :data-outgoing-status="attempt.status"
  >
    <div class="flex min-w-0 max-w-[min(84%,44rem)] flex-row-reverse items-start gap-2">
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-full bg-hover text-fg"
        aria-hidden="true"
      >
        <span class="i-mdi-account size-4" />
      </div>

      <div class="flex min-w-0 max-w-full flex-col items-end">
        <div class="min-w-0 max-w-full rounded-card bg-panel px-3 py-2">
          <div v-if="isMediaContent(attempt.content)" class="flex min-w-0 items-center gap-2">
            <span
              :class="[contentIcon(attempt.content), 'size-5 shrink-0 text-subtle']"
              aria-hidden="true"
            />
            <span class="max-w-64 truncate text-sm font-medium text-fg">
              {{
                attempt.content.media.name || t(`channels.delivery.media.${attempt.content.kind}`)
              }}
            </span>
          </div>
          <MarkdownContent
            v-if="contentText(attempt.content)"
            :class="isMediaContent(attempt.content) ? 'mt-1' : ''"
            :source="contentText(attempt.content)"
            compact
            tone="default"
          />
        </div>

        <div
          v-if="attempt.replyTo"
          class="mt-1 max-w-full border-r-2 border-line-strong pr-2 text-right text-xs text-subtle"
        >
          <span class="font-semibold">
            {{ attempt.replyTo.senderName || t('channels.message.replyReference') }}
          </span>
          <span v-if="attempt.replyTo.text" class="ml-1">{{ attempt.replyTo.text }}</span>
        </div>

        <div
          class="mt-1 flex min-h-7 max-w-full items-center justify-end gap-1.5 text-xs"
          :class="attempt.status === 'failed' ? 'text-danger' : 'text-subtle'"
          :role="attempt.status === 'failed' ? 'alert' : 'status'"
          aria-live="polite"
        >
          <template v-if="attempt.status === 'sending'">
            <span class="i-mdi-loading size-3.5 animate-spin" aria-hidden="true" />
            <span>
              {{
                attempt.progress > 0
                  ? t('channels.delivery.progress', { progress: Math.round(attempt.progress) })
                  : t('channels.delivery.sending')
              }}
            </span>
            <span
              v-if="attempt.progress > 0"
              class="h-1 w-16 overflow-hidden rounded-pill bg-muted"
              role="progressbar"
              :aria-label="t('channels.delivery.uploadProgress')"
              :aria-valuenow="attempt.progress"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span
                class="block h-full bg-fg transition-[width]"
                :style="{ width: `${attempt.progress}%` }"
              />
            </span>
            <TeaIconButton
              size="small"
              :label="t('channels.delivery.cancel')"
              icon="i-mdi-close"
              @click="emit('cancel')"
            />
          </template>
          <template v-else>
            <span
              :class="[
                attempt.status === 'failed' ? 'i-mdi-alert-circle-outline' : 'i-mdi-cancel',
                'size-3.5 shrink-0',
              ]"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate">
              {{
                attempt.status === 'failed'
                  ? t('channels.delivery.failed', { code: attempt.errorCode || 'transport' })
                  : t('channels.delivery.cancelled')
              }}
            </span>
            <TeaIconButton
              v-if="attempt.retryable"
              size="small"
              :label="t('channels.delivery.retry')"
              icon="i-mdi-refresh"
              @click="emit('retry')"
            />
            <TeaIconButton
              size="small"
              :label="t('channels.delivery.dismiss')"
              icon="i-mdi-close"
              @click="emit('dismiss')"
            />
          </template>
        </div>
      </div>
    </div>
  </article>
</template>
