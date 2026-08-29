<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import { TeaButton, TeaIconButton, TeaTextarea } from '@/shared/ui'

import type { Channel, Message } from '../contracts'
import ChannelMessageItem from './ChannelMessageItem.vue'
import {
  isTimelineNearBottom,
  restorePrependScrollTop,
  type TimelineScrollSnapshot,
} from './channelTimelineScroll'

const props = defineProps<{
  channel: Channel
  messages: Message[]
  panelOpen: boolean
  loading: boolean
  hasMore: boolean
  sending: boolean
  activeConversation: ConversationSummary | null
  recentConversations: ConversationSummary[]
  currentSessionAvailable: boolean
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId: string | null
}>()
const emit = defineEmits<{
  forwardToAgent: [
    payload: {
      message: Message
      action: 'current' | 'conversation' | 'runtime' | 'all'
      id?: string
    },
  ]
  togglePanel: []
  send: [text: string]
  loadMore: []
}>()
const { t } = useI18n()
const draft = ref('')
const container = ref<HTMLElement | null>(null)
const initialScrollPending = ref(true)
const prependSnapshot = ref<(TimelineScrollSnapshot & { messageCount: number }) | null>(null)

function submitMessage(): void {
  if (!draft.value.trim()) return
  emit('send', draft.value.trim())
  draft.value = ''
}

function requestOlderMessages(): void {
  const element = container.value
  if (element) {
    prependSnapshot.value = {
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      messageCount: props.messages.length,
    }
  }
  emit('loadMore')
}

watch(
  () => props.channel.ref,
  async () => {
    initialScrollPending.value = true
    prependSnapshot.value = null
    await nextTick()
    if (container.value && props.messages.length > 0) {
      container.value.scrollTop = container.value.scrollHeight
      initialScrollPending.value = false
    }
  },
  { immediate: true },
)

watch(
  () => {
    const message = props.messages.at(-1)
    return message
      ? `${message.ref.messageServerId || message.ref.messageClientId}:${message.text.length}:${message.state}`
      : ''
  },
  async () => {
    const element = container.value
    const lastMessage = props.messages.at(-1)
    if (!element || !lastMessage) return
    const nearBottom = isTimelineNearBottom(element)
    await nextTick()
    if (initialScrollPending.value) {
      element.scrollTop = element.scrollHeight
      initialScrollPending.value = false
    } else if (nearBottom || lastMessage.sentByCurrentUser) {
      element.scrollTop = element.scrollHeight
    }
  },
)

watch(
  () => [props.messages.length, props.loading] as const,
  async () => {
    const snapshot = prependSnapshot.value
    if (!snapshot || props.loading) return
    if (props.messages.length > snapshot.messageCount) {
      await nextTick()
      const element = container.value
      if (element) element.scrollTop = restorePrependScrollTop(snapshot, element.scrollHeight)
    }
    prependSnapshot.value = null
  },
)
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col bg-canvas">
    <header
      class="flex h-14 shrink-0 items-center justify-between border-b border-line-soft bg-panel px-4 sm:px-5"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            v-if="channel.kind === 'group'"
            class="i-mdi-pound size-4 text-subtle"
            aria-hidden="true"
          />
          <h2 class="truncate text-base font-semibold text-fg">{{ channel.name }}</h2>
          <span v-if="channel.memberCount" class="text-sm text-subtle">
            {{ t('channels.members', { count: channel.memberCount }) }}
          </span>
        </div>
        <p class="mt-0.5 truncate text-sm text-subtle">{{ channel.description }}</p>
      </div>
      <div class="flex items-center gap-1">
        <TeaIconButton size="small" :label="t('channels.searchInChannel')" icon="i-mdi-magnify" />
        <TeaIconButton
          size="small"
          :label="t('channels.channelDetails')"
          icon="i-mdi-information-outline"
        />
        <TeaIconButton
          size="small"
          :label="panelOpen ? t('layout.hideRightSidebar') : t('layout.showRightSidebar')"
          icon="i-mdi-dock-right"
          :class="panelOpen ? 'bg-panel text-fg' : 'text-subtle'"
          :aria-pressed="panelOpen"
          @click="emit('togglePanel')"
        />
      </div>
    </header>

    <div ref="container" class="channel-scroll-area flex-1 overflow-y-auto py-2">
      <div
        v-if="loading && messages.length === 0"
        class="flex h-full items-center justify-center text-subtle"
      >
        <span class="i-mdi-loading size-5 animate-spin" aria-hidden="true" />
      </div>
      <div
        v-else-if="messages.length === 0"
        class="flex h-full flex-col items-center justify-center px-8 text-center"
      >
        <span class="i-mdi-message-outline size-6 text-disabled" aria-hidden="true" />
        <p class="mt-2 text-sm font-medium text-subtle">
          {{ t('channels.empty.title') }}
        </p>
        <p class="mt-1 text-xs text-disabled">{{ t('channels.empty.description') }}</p>
      </div>
      <div v-else class="mx-auto w-full max-w-4xl">
        <div v-if="hasMore" class="flex justify-center pb-2">
          <TeaButton
            appearance="ghost"
            size="small"
            :disabled="loading"
            @click="requestOlderMessages"
          >
            {{ loading ? t('channels.history.loading') : t('channels.history.loadMore') }}
          </TeaButton>
        </div>
        <div class="mb-2 flex items-center gap-3 px-5">
          <span class="h-px flex-1 bg-line-soft" />
          <span class="text-xs text-subtle">{{ t('channels.today') }}</span>
          <span class="h-px flex-1 bg-line-soft" />
        </div>
        <ChannelMessageItem
          v-for="(message, index) in messages"
          :key="message.ref.messageServerId || message.ref.messageClientId"
          :message="message"
          :menu-open-up="index >= messages.length - 2"
          :active-conversation="activeConversation"
          :recent-conversations="recentConversations"
          :current-session-available="currentSessionAvailable"
          :runtimes="runtimes"
          :default-runtime-id="defaultRuntimeId"
          @forward-to-agent="(action, id) => emit('forwardToAgent', { message, action, id })"
        />
      </div>
    </div>

    <div class="channel-composer-bar shrink-0 px-3 py-2.5 sm:px-4">
      <div class="channel-composer-shell mx-auto flex w-full max-w-4xl items-end gap-2">
        <TeaTextarea
          v-model="draft"
          class="channel-composer-input min-w-0 flex-1"
          size="compact"
          :rows="1"
          :label="t('channels.composer.placeholder', { channel: channel.name })"
          :placeholder="t('channels.composer.placeholder', { channel: channel.name })"
          @keydown.meta.enter.prevent="submitMessage"
          @keydown.ctrl.enter.prevent="submitMessage"
        />
        <TeaIconButton
          class="channel-composer-send"
          size="small"
          :label="t('channels.composer.send')"
          icon="i-mdi-arrow-up"
          appearance="primary"
          :disabled="!draft.trim() || sending"
          @click="submitMessage"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.channel-scroll-area {
  scrollbar-color: rgb(156 163 175 / 28%) transparent;
  scrollbar-width: thin;
}
.channel-composer-bar {
  border-top: 1px solid var(--tea-line-soft);
  background: var(--tea-panel);
}
.channel-composer-shell {
  border: 1px solid var(--tea-line);
  border-radius: var(--tea-radius-card);
  background: var(--tea-canvas);
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
  transition: border-color 150ms ease;
}
.channel-composer-shell:focus-within {
  border-color: var(--tea-fg);
}
.channel-composer-input {
  min-height: 2.25rem;
  max-height: 8rem;
  resize: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0.375rem 0.25rem;
  box-shadow: none;
}
.channel-composer-input:focus {
  border-color: transparent;
  box-shadow: none;
  outline: none;
}
.channel-composer-send {
  margin-bottom: 0.125rem;
}
</style>
