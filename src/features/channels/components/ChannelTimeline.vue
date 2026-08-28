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
  <section class="flex min-w-0 flex-1 flex-col tea-bg-canvas">
    <header class="flex h-14 shrink-0 items-center justify-between px-5">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            v-if="channel.kind === 'group'"
            class="i-mdi-pound size-4 tea-fg-subtle"
            aria-hidden="true"
          />
          <h2 class="truncate tea-text-body tea-weight-strong tea-fg">{{ channel.name }}</h2>
          <span v-if="channel.memberCount" class="tea-text-caption tea-fg-subtle">
            {{ t('channels.members', { count: channel.memberCount }) }}
          </span>
        </div>
        <p class="mt-0.5 truncate tea-text-caption tea-fg-subtle">{{ channel.description }}</p>
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
          :class="panelOpen ? 'tea-bg-muted tea-fg' : 'tea-fg-subtle'"
          :aria-pressed="panelOpen"
          @click="emit('togglePanel')"
        />
      </div>
    </header>

    <div ref="container" class="channel-scroll-area flex-1 overflow-y-auto py-3">
      <div
        v-if="loading && messages.length === 0"
        class="flex h-full items-center justify-center tea-fg-subtle"
      >
        <span class="i-mdi-loading size-5 animate-spin" aria-hidden="true" />
      </div>
      <div
        v-else-if="messages.length === 0"
        class="flex h-full flex-col items-center justify-center px-8 text-center"
      >
        <span class="i-mdi-message-outline size-7 tea-fg-disabled" aria-hidden="true" />
        <p class="mt-3 tea-text-body tea-weight-medium tea-fg-subtle">
          {{ t('channels.empty.title') }}
        </p>
        <p class="mt-1 tea-text-caption tea-fg-disabled">{{ t('channels.empty.description') }}</p>
      </div>
      <div v-else class="mx-auto w-full max-w-5xl">
        <div v-if="hasMore" class="flex justify-center pb-3">
          <TeaButton
            appearance="ghost"
            size="small"
            :disabled="loading"
            @click="requestOlderMessages"
          >
            {{ loading ? t('channels.history.loading') : t('channels.history.loadMore') }}
          </TeaButton>
        </div>
        <div class="mb-4 flex items-center gap-3 px-6">
          <span class="h-px flex-1 tea-bg-muted" />
          <span class="tea-text-micro tea-fg-subtle">{{ t('channels.today') }}</span>
          <span class="h-px flex-1 tea-bg-muted" />
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

    <div class="shrink-0 tea-bg-muted px-4 pb-3 pt-2.5">
      <div class="flex items-end gap-2">
        <TeaIconButton size="small" :label="t('channels.composer.add')" icon="i-mdi-plus" />
        <TeaTextarea
          v-model="draft"
          class="min-w-0 flex-1"
          size="compact"
          :rows="1"
          :label="t('channels.composer.placeholder', { channel: channel.name })"
          :placeholder="t('channels.composer.placeholder', { channel: channel.name })"
          @keydown.meta.enter.prevent="submitMessage"
          @keydown.ctrl.enter.prevent="submitMessage"
        />
        <TeaIconButton
          size="small"
          :label="t('channels.composer.send')"
          icon="i-mdi-arrow-up"
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
</style>
