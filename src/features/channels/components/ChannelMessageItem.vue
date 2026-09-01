<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import { TeaButton } from '@/shared/ui'
import type { ConversationSummary } from '@/features/conversation/contracts'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import type { Message } from '../contracts'
import ChannelMessageActions from './ChannelMessageActions.vue'

defineProps<{
  message: Message
  menuOpenUp: boolean
  activeConversation: ConversationSummary | null
  recentConversations: ConversationSummary[]
  currentSessionAvailable: boolean
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId: string | null
}>()
const emit = defineEmits<{
  forwardToAgent: [action: 'current' | 'conversation' | 'runtime' | 'all', id?: string]
}>()
const { t } = useI18n()

function initials(name: string): string {
  return [...name].slice(0, 2).join('').toUpperCase()
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value)
}
</script>

<template>
  <article
    class="channel-message group relative flex px-5 py-1.5"
    :class="message.sentByCurrentUser ? 'justify-end' : 'justify-start'"
    :data-message-id="message.ref.messageClientId"
    :data-message-direction="message.sentByCurrentUser ? 'outgoing' : 'incoming'"
  >
    <div
      class="flex max-w-[min(84%,44rem)] items-start gap-2"
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
          class="mt-1 flex min-w-0 items-start gap-1.5"
          :class="message.sentByCurrentUser ? 'flex-row-reverse' : 'flex-row'"
        >
          <div
            v-if="message.state === 'active'"
            class="min-w-0 rounded-card px-3 py-2"
            :class="message.sentByCurrentUser ? 'bg-panel' : 'bg-canvas'"
          >
            <MarkdownContent :source="message.text" compact tone="default" />
          </div>
          <p
            v-else
            class="min-w-0 rounded-card bg-panel px-3 py-2 text-sm italic leading-5 text-subtle"
          >
            {{ t('channels.message.revoked') }}
          </p>

          <ChannelMessageActions
            class="mt-0.5"
            :open-up="menuOpenUp"
            :active-conversation="activeConversation"
            :recent-conversations="recentConversations"
            :current-session-available="currentSessionAvailable"
            :runtimes="runtimes"
            :default-runtime-id="defaultRuntimeId"
            @forward-to-agent="(action, id) => emit('forwardToAgent', action, id)"
          />
        </div>

        <div v-if="message.reactions.length" class="mt-1.5 flex gap-1">
          <TeaButton
            v-for="reaction in message.reactions"
            :key="reaction.type"
            appearance="ghost"
            size="small"
            class="inline-flex h-6 items-center gap-1 rounded-pill px-1.5 text-sm transition-colors"
            :class="reaction.active ? 'bg-hover text-fg' : 'bg-panel text-dim hover:bg-pressed'"
          >
            <span>#{{ reaction.type }}</span>
            <span>{{ reaction.count }}</span>
          </TeaButton>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
@media (hover: hover) and (pointer: fine) {
  .channel-message:hover :deep(.channel-message-actions) {
    pointer-events: auto;
    opacity: 1;
  }
}
</style>
