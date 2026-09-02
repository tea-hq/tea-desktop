<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import { TeaButton, TeaCheckbox } from '@/shared/ui'
import type { ConversationSummary } from '@/features/conversation/contracts'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import type { Message } from '../contracts'
import ChannelMessageActions from './ChannelMessageActions.vue'
import ChannelMergedMessageCard from './ChannelMergedMessageCard.vue'
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
  }>(),
  { highlighted: false, interactive: true, selectionMode: false, selected: false },
)
const emit = defineEmits<{
  forwardToAgent: [action: 'current' | 'conversation' | 'runtime' | 'all', id?: string]
  action: [action: MessageAction]
  toggleSelection: []
  openMerged: []
  openReceiptDetails: []
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
              <img
                v-if="message.content.kind === 'image' && message.content.media.url"
                class="channel-message-media-image"
                :src="message.content.media.url"
                :alt="message.content.media.name || t('channels.message.image')"
                loading="lazy"
              />
              <audio
                v-else-if="message.content.kind === 'audio' && message.content.media.url"
                class="channel-message-media-audio"
                controls
                preload="metadata"
                :src="message.content.media.url"
              />
              <video
                v-else-if="message.content.kind === 'video' && message.content.media.url"
                class="channel-message-media-video"
                controls
                preload="metadata"
                :src="message.content.media.url"
              />
              <a
                v-else-if="message.content.kind === 'file' && message.content.media.url"
                class="flex items-center gap-2 text-sm font-medium text-fg underline decoration-line-soft underline-offset-2"
                :href="message.content.media.url"
                target="_blank"
                rel="noreferrer"
              >
                <span
                  :class="[mediaIcon(message.content.kind), 'size-5 shrink-0']"
                  aria-hidden="true"
                />
                <span class="max-w-56 truncate">{{
                  message.content.media.name || message.text
                }}</span>
              </a>
              <div v-else class="flex min-w-0 items-center gap-2 text-sm text-subtle">
                <span
                  :class="[mediaIcon(message.content.kind), 'size-5 shrink-0']"
                  aria-hidden="true"
                />
                <span class="max-w-56 truncate">{{
                  message.content.media.name || message.text
                }}</span>
              </div>
              <p v-if="message.content.caption" class="mt-1 text-sm leading-5 text-fg">
                {{ message.content.caption }}
              </p>
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
.channel-message-media-image,
.channel-message-media-video {
  display: block;
  max-width: min(28rem, 70vw);
  max-height: 20rem;
  border-radius: var(--tea-radius-inline);
  object-fit: contain;
  background: var(--tea-muted);
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
