<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import { TeaButton, TeaIconButton } from '@/shared/ui'
import type { ConversationSummary } from '@/features/conversation/contracts'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import type { Message } from '../contracts'
import ChannelAgentMenu from './ChannelAgentMenu.vue'

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
const menuOpen = ref(false)
const menuAnchor = ref<HTMLElement | null>(null)

function initials(name: string): string {
  return [...name].slice(0, 2).join('').toUpperCase()
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value)
}

function forwardToAgent(action: 'current' | 'conversation' | 'runtime' | 'all', id?: string): void {
  emit('forwardToAgent', action, id)
  menuOpen.value = false
}

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value
}
</script>

<template>
  <article
    class="group relative flex px-5 py-1.5"
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
          class="mt-1 flex min-w-0 items-center gap-1.5"
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

          <div
            class="relative z-20 flex shrink-0 rounded-control bg-canvas p-0.5 opacity-0 ring-2 ring-focus ring-offset-2 ring-offset-canvas transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          >
            <span ref="menuAnchor">
              <TeaIconButton
                size="small"
                :label="t('channels.task.openMenu')"
                icon="i-mdi-creation-outline"
                :aria-expanded="menuOpen"
                @click.stop="toggleMenu"
              />
            </span>
            <ChannelAgentMenu
              v-if="menuOpen"
              :anchor="menuAnchor"
              :active-conversation="activeConversation"
              :recent-conversations="recentConversations"
              :current-session-available="currentSessionAvailable"
              :runtimes="runtimes"
              :default-runtime-id="defaultRuntimeId"
              @add-to-current="forwardToAgent('current')"
              @select-conversation="forwardToAgent('conversation', $event)"
              @create-runtime="forwardToAgent('runtime', $event)"
              @view-all="forwardToAgent('all')"
              @close="menuOpen = false"
            />
          </div>
        </div>

        <div v-if="message.reactions.length" class="mt-1.5 flex gap-1">
          <TeaButton
            v-for="reaction in message.reactions"
            :key="reaction.type"
            appearance="ghost"
            size="small"
            class="inline-flex h-6 items-center gap-1 rounded-control px-1.5 text-sm transition-colors"
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
