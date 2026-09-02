<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import { TeaButton, TeaCheckbox } from '@/shared/ui'
import type { ConversationSummary } from '@/features/conversation/contracts'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import type {
  ChannelVoicePlaybackRate,
  ChannelVoicePlaybackState,
  ChannelVoiceTranscript,
  ChannelMediaSaveState,
  Message,
} from '../contracts'
import ChannelMessageActions from './ChannelMessageActions.vue'
import ChannelMediaSaveControl from './ChannelMediaSaveControl.vue'
import ChannelMergedMessageCard from './ChannelMergedMessageCard.vue'
import ChannelVoiceMessagePlayer from './ChannelVoiceMessagePlayer.vue'
import type { MessageAction } from './ChannelMessageActions.vue'

const props = withDefaults(
  defineProps<{
    message: Message
    highlighted?: boolean
    menuOpenUp: boolean
    activeConversation: ConversationSummary | null
    recentConversations: ConversationSummary[]
    currentSessionAvailable: boolean
    runtimes: RuntimeDescriptor[]
    defaultRuntimeId: string | null
    interactive?: boolean
    selectionMode?: boolean
    selected?: boolean
    voiceTranscript?: ChannelVoiceTranscript | null
    voiceTranscriptionAvailable?: boolean
    voicePlayback?: ChannelVoicePlaybackState | null
    voicePlaybackRate?: ChannelVoicePlaybackRate
    voicePlaybackAvailable?: boolean
    mediaSave?: ChannelMediaSaveState | null
    mediaSavingAvailable?: boolean
  }>(),
  {
    highlighted: false,
    interactive: true,
    selectionMode: false,
    selected: false,
    voiceTranscript: null,
    voiceTranscriptionAvailable: false,
    voicePlayback: null,
    voicePlaybackRate: 1,
    voicePlaybackAvailable: false,
    mediaSave: null,
    mediaSavingAvailable: false,
  },
)
const emit = defineEmits<{
  forwardToAgent: [action: 'current' | 'conversation' | 'runtime' | 'all', id?: string]
  action: [action: MessageAction]
  toggleSelection: []
  openMerged: []
  openReceiptDetails: []
  transcribeVoice: []
  toggleVoicePlayback: []
  retryVoicePlayback: []
  seekVoicePlayback: [positionMs: number]
  setVoicePlaybackRate: [rate: ChannelVoicePlaybackRate]
  openMedia: []
  saveMedia: []
  cancelMediaSave: []
  retryMediaSave: []
}>()
const { t } = useI18n()

function initials(name: string): string {
  return [...name].slice(0, 2).join('').toUpperCase()
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value)
}

function reactionLabel(type: number): string {
  return (
    (
      {
        1: '👍',
        2: '❤️',
        3: '😂',
        4: '🎉',
        5: '🙏',
        6: '👀',
      } as Record<number, string>
    )[type] ?? `#${type}`
  )
}

function mediaIcon(kind: Message['content']['kind']): string {
  if (kind === 'image') return 'i-mdi-image-outline'
  if (kind === 'audio') return 'i-mdi-music-note-outline'
  if (kind === 'video') return 'i-mdi-video-outline'
  return 'i-mdi-file-outline'
}

function isMediaContent(
  content: Message['content'],
): content is Extract<Message['content'], { kind: 'image' | 'audio' | 'video' | 'file' }> {
  return (
    content.kind === 'image' ||
    content.kind === 'audio' ||
    content.kind === 'video' ||
    content.kind === 'file'
  )
}

type MediaContent = Extract<Message['content'], { kind: 'image' | 'audio' | 'video' | 'file' }>

function mediaName(content: MediaContent): string {
  return content.media.name?.trim() || props.message.text
}

function mediaSize(content: MediaContent): string {
  const value = content.media.size
  if (!Number.isFinite(value) || value === undefined || value < 0) return ''
  if (value < 1_024) return `${Math.round(value)} B`
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`
  return `${(value / 1_073_741_824).toFixed(1)} GB`
}

function mediaOpenLabel(content: Extract<MediaContent, { kind: 'image' | 'video' }>): string {
  return t(`channels.message.media.${content.kind === 'image' ? 'openImage' : 'openVideo'}`)
}

function mediaAspectRatio(content: MediaContent): string {
  const { width, height } = content.media
  if (!width || !height || width <= 0 || height <= 0) return '16 / 10'
  return `${width} / ${height}`
}

function selectMessage(): void {
  if (props.selectionMode && props.message.state === 'active') emit('toggleSelection')
}
</script>

<template>
  <article
    class="channel-message group relative flex px-5 py-1.5"
    :class="[
      message.sentByCurrentUser ? 'justify-end' : 'justify-start',
      highlighted ? 'bg-hover' : '',
      selected ? 'bg-hover' : '',
      selectionMode && message.state === 'active' ? 'cursor-pointer' : '',
    ]"
    :data-message-id="message.ref.messageClientId"
    :data-message-key="`${message.ref.channelRef}:${message.ref.messageServerId || message.ref.messageClientId}`"
    :data-message-direction="message.sentByCurrentUser ? 'outgoing' : 'incoming'"
    @click="selectMessage"
  >
    <TeaCheckbox
      v-if="selectionMode"
      class="flex w-7 shrink-0 items-center justify-center self-stretch"
      :model-value="selected"
      :label="t('channels.selection.selectMessage', { sender: message.sender.name })"
      :disabled="message.state !== 'active'"
      :show-label="false"
      @click.stop
      @update:model-value="emit('toggleSelection')"
    />
    <div
      class="flex min-w-0 max-w-[min(84%,44rem)] items-start gap-2"
      :class="message.sentByCurrentUser ? 'flex-row-reverse' : 'flex-row'"
    >
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        :class="message.sentByCurrentUser ? 'bg-hover text-fg' : 'bg-muted text-dim'"
      >
        {{ initials(message.sender.name) }}
      </div>

      <div
        class="flex min-w-0 flex-col"
        :class="message.sentByCurrentUser ? 'items-end' : 'items-start'"
      >
        <div
          class="flex items-baseline gap-2"
          :class="message.sentByCurrentUser ? 'flex-row-reverse' : 'flex-row'"
        >
          <span class="max-w-52 truncate text-sm font-semibold text-fg">{{
            message.sender.name
          }}</span>
          <span class="shrink-0 text-xs tabular-nums text-subtle">{{
            formatTime(message.sentAt)
          }}</span>
        </div>

        <div
          class="mt-1 flex min-w-0 max-w-full items-start gap-1.5"
          :class="message.sentByCurrentUser ? 'flex-row-reverse' : 'flex-row'"
        >
          <div
            v-if="message.state === 'active'"
            class="min-w-0 rounded-card px-3 py-2"
            :class="message.sentByCurrentUser ? 'bg-panel' : 'bg-canvas'"
          >
            <ChannelMergedMessageCard
              v-if="message.content.kind === 'merged'"
              :content="message.content"
              :interactive="!selectionMode"
              @open="emit('openMerged')"
            />
            <template v-else-if="isMediaContent(message.content)">
              <div class="channel-message-media flex min-w-0 flex-col gap-2">
                <button
                  v-if="message.content.kind === 'image' && message.content.media.url"
                  type="button"
                  class="channel-message-media-preview relative flex items-center justify-center overflow-hidden rounded-inline bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default"
                  :style="{ aspectRatio: mediaAspectRatio(message.content) }"
                  :aria-label="mediaOpenLabel(message.content)"
                  :disabled="!interactive || selectionMode"
                  data-media-preview
                  @click.stop="emit('openMedia')"
                >
                  <img
                    class="size-full object-contain"
                    :src="message.content.media.url"
                    :alt="mediaName(message.content) || t('channels.message.image')"
                    loading="lazy"
                  />
                </button>
                <button
                  v-else-if="message.content.kind === 'video' && message.content.media.url"
                  type="button"
                  class="channel-message-media-preview relative flex items-center justify-center overflow-hidden rounded-inline bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default"
                  :style="{ aspectRatio: mediaAspectRatio(message.content) }"
                  :aria-label="mediaOpenLabel(message.content)"
                  :disabled="!interactive || selectionMode"
                  data-media-preview
                  @click.stop="emit('openMedia')"
                >
                  <video
                    class="pointer-events-none size-full object-contain"
                    :src="message.content.media.url"
                    preload="metadata"
                    playsinline
                    aria-hidden="true"
                    tabindex="-1"
                  />
                  <span
                    class="absolute flex size-10 items-center justify-center rounded-full bg-canvas/90 text-fg"
                    aria-hidden="true"
                  >
                    <span class="i-mdi-play size-5" />
                  </span>
                </button>
                <ChannelVoiceMessagePlayer
                  v-else-if="message.content.kind === 'audio' && message.content.media.url"
                  :playback="voicePlayback"
                  :duration-ms="message.content.media.durationMs"
                  :playback-rate="voicePlaybackRate"
                  :interactive="voicePlaybackAvailable && interactive && !selectionMode"
                  @toggle="emit('toggleVoicePlayback')"
                  @retry="emit('retryVoicePlayback')"
                  @seek="emit('seekVoicePlayback', $event)"
                  @rate="emit('setVoicePlaybackRate', $event)"
                />
                <div class="flex min-w-0 items-center gap-2">
                  <span
                    :class="[mediaIcon(message.content.kind), 'size-5 shrink-0 text-subtle']"
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="max-w-64 truncate text-sm font-medium text-fg">
                      {{ mediaName(message.content) }}
                    </p>
                    <p v-if="mediaSize(message.content)" class="text-xs tabular-nums text-subtle">
                      {{ mediaSize(message.content) }}
                    </p>
                  </div>
                  <ChannelMediaSaveControl
                    :state="mediaSave"
                    :available="mediaSavingAvailable"
                    :interactive="interactive && !selectionMode"
                    @save="emit('saveMedia')"
                    @cancel="emit('cancelMediaSave')"
                    @retry="emit('retryMediaSave')"
                  />
                </div>
                <p v-if="message.content.caption" class="text-sm leading-5 text-fg">
                  {{ message.content.caption }}
                </p>
              </div>
              <div
                v-if="
                  message.content.kind === 'audio' &&
                  (voiceTranscript ||
                    (voiceTranscriptionAvailable && interactive && !selectionMode))
                "
                class="mt-2 min-w-0 border-t border-line-soft pt-1.5"
              >
                <div
                  v-if="voiceTranscript?.status === 'loading'"
                  class="flex min-h-8 items-center gap-2 text-xs text-subtle"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    class="i-mdi-loading size-4 shrink-0 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <span>{{ t('channels.message.voice.loading') }}</span>
                </div>
                <div
                  v-else-if="voiceTranscript?.status === 'ready'"
                  class="min-w-0 py-1"
                  data-voice-transcript
                >
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-dim">
                    <span class="i-mdi-text-box-outline size-4 shrink-0" aria-hidden="true" />
                    <span>{{ t('channels.message.voice.label') }}</span>
                  </div>
                  <p class="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-fg">
                    {{ voiceTranscript.text }}
                  </p>
                </div>
                <div
                  v-else-if="voiceTranscript?.status === 'failed'"
                  class="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-danger"
                  role="alert"
                >
                  <span class="i-mdi-alert-circle-outline size-4 shrink-0" aria-hidden="true" />
                  <span class="min-w-0 break-words">
                    {{
                      t('channels.message.voice.failed', {
                        code: voiceTranscript.errorCode || 'transport',
                      })
                    }}
                  </span>
                  <TeaButton
                    v-if="voiceTranscript.retryable && interactive && !selectionMode"
                    appearance="ghost"
                    size="small"
                    class="min-h-7 px-2 text-xs"
                    :aria-label="t('channels.message.voice.retry')"
                    @click.stop="emit('transcribeVoice')"
                  >
                    <span class="i-mdi-refresh size-3.5" aria-hidden="true" />
                    {{ t('channels.message.voice.retry') }}
                  </TeaButton>
                </div>
                <TeaButton
                  v-else
                  appearance="ghost"
                  size="small"
                  class="min-h-7 px-2 text-xs"
                  :aria-label="t('channels.message.voice.action')"
                  @click.stop="emit('transcribeVoice')"
                >
                  <span class="i-mdi-text-box-search-outline size-4" aria-hidden="true" />
                  {{ t('channels.message.voice.action') }}
                </TeaButton>
              </div>
            </template>
            <MarkdownContent v-else :source="message.text" compact tone="default" />
          </div>
          <p
            v-else
            class="min-w-0 rounded-card bg-panel px-3 py-2 text-sm italic leading-5 text-subtle"
          >
            {{ t('channels.message.revoked') }}
          </p>

          <ChannelMessageActions
            v-if="interactive && !selectionMode"
            class="mt-0.5"
            :open-up="menuOpenUp"
            :sent-by-current-user="message.sentByCurrentUser"
            :message-state="message.state"
            :pinned="message.pinned"
            :active-conversation="activeConversation"
            :recent-conversations="recentConversations"
            :current-session-available="currentSessionAvailable"
            :runtimes="runtimes"
            :default-runtime-id="defaultRuntimeId"
            @action="(action) => emit('action', action)"
            @forward-to-agent="(action, id) => emit('forwardToAgent', action, id)"
          />
        </div>

        <div
          v-if="message.replyTo"
          class="mt-1 max-w-full border-l-2 border-line-strong pl-2 text-xs text-subtle"
        >
          <span class="font-semibold">{{ message.replyTo.senderName }}</span>
          <span class="ml-1">{{
            message.replyTo.text || t('channels.message.replyReference')
          }}</span>
        </div>

        <div v-if="message.reactions.length" class="mt-1.5 flex gap-1">
          <TeaButton
            v-for="reaction in message.reactions"
            :key="reaction.type"
            appearance="ghost"
            size="small"
            class="inline-flex h-6 items-center gap-1 rounded-pill px-1.5 text-sm transition-colors"
            :class="reaction.active ? 'bg-hover text-fg' : 'bg-panel text-dim hover:bg-pressed'"
            :disabled="!interactive"
          >
            <span>{{ reactionLabel(reaction.type) }}</span>
            <span>{{ reaction.count }}</span>
          </TeaButton>
        </div>
        <TeaButton
          v-if="
            message.sentByCurrentUser &&
            message.receipt &&
            (message.receipt.readCount !== undefined || message.receipt.unreadCount !== undefined)
          "
          appearance="ghost"
          size="small"
          class="mt-1 h-6 px-1.5 text-xs text-subtle"
          @click="emit('openReceiptDetails')"
        >
          <span class="i-mdi-check-all size-3.5" aria-hidden="true" />
          {{
            t('channels.receipts.summary', {
              read: message.receipt.readCount ?? 0,
              unread: message.receipt.unreadCount ?? 0,
            })
          }}
        </TeaButton>
        <span
          v-else-if="message.sentByCurrentUser && message.receipt?.readAt"
          class="mt-1 inline-flex items-center gap-1 text-xs text-subtle"
        >
          <span class="i-mdi-check-all size-3.5" aria-hidden="true" />
          {{ t('channels.receipts.read') }}
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.channel-message-media {
  width: min(28rem, 68vw);
  max-width: 100%;
}

.channel-message-media-preview {
  width: min(24rem, 100%);
  max-height: 18rem;
}

.channel-message-media-audio {
  width: min(20rem, 65vw);
  max-width: 100%;
}

@media (hover: hover) and (pointer: fine) {
  .channel-message:hover :deep(.channel-message-actions) {
    pointer-events: auto;
    opacity: 1;
  }
}
</style>
