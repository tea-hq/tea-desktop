<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import { TeaButton, TeaIconButton } from '@/shared/ui'

import type {
  Channel,
  ChannelAttachment,
  ChannelMember,
  ChannelMediaSaveState,
  ChannelPresence,
  ChannelVoicePlaybackRate,
  ChannelVoicePlaybackState,
  ChannelVoiceTranscript,
  ChannelUserProfile,
  Message,
  MessageMention,
  OutgoingMessageAttempt,
} from '../contracts'
import type { ForwardMessageMode } from '../contracts'
import { FORWARD_MESSAGE_LIMIT } from '../messageForwarding'
import { messageSelectionKey } from '../useChannelMessageSelection'
import { sameMessage } from '../projection'
import ChannelComposer from './ChannelComposer.vue'
import ChannelMessageItem from './ChannelMessageItem.vue'
import ChannelOutgoingMessageItem from './ChannelOutgoingMessageItem.vue'
import ChannelPresenceIndicator from './ChannelPresenceIndicator.vue'
import type { MessageAction } from './ChannelMessageActions.vue'
import {
  isTimelineNearBottom,
  restorePrependScrollTop,
  type TimelineScrollSnapshot,
} from './channelTimelineScroll'
import { debugQuickComment } from '../quickCommentDebug'

const props = withDefaults(
  defineProps<{
    channel: Channel
    messages: Message[]
    outgoingAttempts?: OutgoingMessageAttempt[]
    panelOpen: boolean
    threadAvailable?: boolean
    loading: boolean
    hasMore: boolean
    hasMoreNewer?: boolean
    highlightedMessageKey?: string | null
    activeConversation: ConversationSummary | null
    recentConversations: ConversationSummary[]
    currentSessionAvailable: boolean
    runtimes: RuntimeDescriptor[]
    defaultRuntimeId: string | null
    replyTo?: Message | null
    attachments?: ChannelAttachment[]
    selectionMode?: boolean
    selectedMessageKeys?: string[]
    selectedCount?: number
    canForwardIndividual?: boolean
    canForwardMerged?: boolean
    mentionMembers?: ChannelMember[]
    mentionMembersLoading?: boolean
    draft?: string
    draftMentions?: MessageMention[]
    draftSaving?: boolean
    draftErrorCode?: string | null
    draftHasUnresolvedDelivery?: boolean
    presence?: ChannelPresence | null
    voicePlaybacks?: ChannelVoicePlaybackState[]
    voicePlaybackRate?: ChannelVoicePlaybackRate
    voicePlaybackAvailable?: boolean
    voiceTranscripts?: ChannelVoiceTranscript[]
    voiceTranscriptionAvailable?: boolean
    mediaSaves?: ChannelMediaSaveState[]
    mediaSavingAvailable?: boolean
    userProfiles?: ReadonlyMap<string, ChannelUserProfile>
  }>(),
  {
    replyTo: null,
    hasMoreNewer: false,
    highlightedMessageKey: null,
    attachments: () => [],
    selectionMode: false,
    selectedMessageKeys: () => [],
    selectedCount: 0,
    canForwardIndividual: false,
    canForwardMerged: false,
    mentionMembers: () => [],
    mentionMembersLoading: false,
    draft: '',
    draftMentions: () => [],
    draftSaving: false,
    draftErrorCode: null,
    draftHasUnresolvedDelivery: false,
    outgoingAttempts: () => [],
    presence: null,
    voicePlaybacks: () => [],
    voicePlaybackRate: 1,
    voicePlaybackAvailable: false,
    voiceTranscripts: () => [],
    voiceTranscriptionAvailable: false,
    mediaSaves: () => [],
    mediaSavingAvailable: false,
    userProfiles: undefined,
    threadAvailable: false,
  },
)
const emit = defineEmits<{
  forwardToAgent: [
    payload: {
      message: Message
      action: 'current' | 'conversation' | 'runtime' | 'all'
      id?: string
    },
  ]
  messageAction: [payload: { message: Message; action: MessageAction }]
  quickComment: [payload: { message: Message; type: number; active: boolean }]
  togglePanel: []
  send: [
    payload: {
      text: string
      replyTo: Message | null
      attachments: ChannelAttachment[]
      mentions: MessageMention[]
    },
  ]
  pickAttachments: []
  removeAttachment: [token: string]
  cancelReply: []
  showDetails: []
  loadMore: []
  loadNewer: []
  refreshMessages: []
  openSearch: []
  openPinned: []
  toggleMessageSelection: [message: Message]
  selectAllVisible: []
  cancelSelection: []
  forwardSelection: [mode: ForwardMessageMode]
  openMerged: [message: Message]
  requestMentionMembers: []
  openReceiptDetails: [message: Message]
  updateDraft: [payload: { text: string; mentions: MessageMention[] }]
  retryOutgoing: [attemptId: string]
  cancelOutgoing: [attemptId: string]
  dismissOutgoing: [attemptId: string]
  transcribeVoice: [message: Message]
  toggleVoicePlayback: [message: Message]
  retryVoicePlayback: [message: Message]
  seekVoicePlayback: [payload: { message: Message; positionMs: number }]
  setVoicePlaybackRate: [rate: ChannelVoicePlaybackRate]
  openMedia: [message: Message]
  saveMedia: [message: Message]
  cancelMediaSave: [message: Message]
  retryMediaSave: [message: Message]
}>()
const { t } = useI18n()
const container = ref<HTMLElement | null>(null)
const initialScrollPending = ref(true)
const prependSnapshot = ref<(TimelineScrollSnapshot & { messageCount: number }) | null>(null)
const channelDescription = computed(() => {
  if (props.channel.kind === 'group') return props.channel.description
  const accountId = props.channel.directAccountId?.trim()
  return accountId ? (props.userProfiles?.get(accountId)?.sign ?? '') : ''
})

function voiceTranscript(message: Message): ChannelVoiceTranscript | null {
  return (
    props.voiceTranscripts.find((transcript) => sameMessage(transcript.messageRef, message.ref)) ??
    null
  )
}

function voicePlayback(message: Message): ChannelVoicePlaybackState | null {
  return (
    props.voicePlaybacks.find((playback) => sameMessage(playback.messageRef, message.ref)) ?? null
  )
}

function mediaSave(message: Message): ChannelMediaSaveState | null {
  return props.mediaSaves.find((state) => sameMessage(state.messageRef, message.ref)) ?? null
}

function isMessageSelected(message: Message): boolean {
  return props.selectedMessageKeys.includes(messageSelectionKey(message))
}

function handleQuickComment(message: Message, type: number, active: boolean): void {
  debugQuickComment('timeline.emit', {
    ref: message.ref,
    type,
    active,
    reactions: message.reactions,
  })
  emit('quickComment', { message, type, active })
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
  () =>
    props.outgoingAttempts
      .map((attempt) => `${attempt.attemptId}:${attempt.status}:${attempt.progress}`)
      .join('|'),
  async () => {
    const element = container.value
    if (!element) return
    const nearBottom = isTimelineNearBottom(element)
    await nextTick()
    if (nearBottom) element.scrollTop = element.scrollHeight
  },
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

watch(
  () => props.highlightedMessageKey,
  async (value) => {
    if (!value) return
    await nextTick()
    const element = container.value
    const target = element
      ? [...element.querySelectorAll<HTMLElement>('[data-message-key]')].find(
          (candidate) => candidate.dataset.messageKey === value,
        )
      : undefined
    if (target && typeof target.scrollIntoView === 'function')
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
)
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col bg-canvas">
    <header
      class="flex h-14 min-w-0 shrink-0 items-center justify-between border-b border-line-soft bg-panel px-4 sm:px-5"
    >
      <div class="channel-header__summary min-w-0 flex-1 overflow-hidden">
        <div class="flex min-w-0 items-center gap-2">
          <span
            v-if="channel.kind === 'group'"
            class="i-mdi-pound size-4 text-subtle"
            aria-hidden="true"
          />
          <h2 class="min-w-0 truncate text-base font-semibold text-fg">{{ channel.name }}</h2>
          <ChannelPresenceIndicator
            v-if="channel.kind === 'direct' && channel.directAccountId"
            :availability="presence?.availability ?? 'unknown'"
            size="inline"
          />
          <span v-if="channel.memberCount" class="shrink-0 whitespace-nowrap text-sm text-subtle">
            {{ t('channels.members', { count: channel.memberCount }) }}
          </span>
        </div>
        <p
          v-if="channelDescription"
          class="channel-header__description mt-0.5 truncate text-sm text-subtle"
        >
          {{ channelDescription }}
        </p>
      </div>
      <div class="channel-header__actions flex shrink-0 items-center gap-1">
        <TeaIconButton
          size="small"
          :label="t('channels.searchInChannel')"
          icon="i-mdi-magnify"
          @click="emit('openSearch')"
        />
        <TeaIconButton
          size="small"
          :label="t('channels.pinned.open')"
          icon="i-mdi-pin-outline"
          @click="emit('openPinned')"
        />
        <TeaIconButton
          size="small"
          :label="t('channels.refreshMessages')"
          icon="i-mdi-refresh"
          :disabled="loading"
          @click="emit('refreshMessages')"
        />
        <TeaIconButton
          size="small"
          :label="t('channels.channelDetails')"
          icon="i-mdi-information-outline"
          @click="emit('showDetails')"
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
        v-if="loading && messages.length === 0 && outgoingAttempts.length === 0"
        class="flex h-full items-center justify-center text-subtle"
      >
        <span class="i-mdi-loading size-5 animate-spin" aria-hidden="true" />
      </div>
      <div
        v-else-if="messages.length === 0 && outgoingAttempts.length === 0"
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
          :thread-available="threadAvailable"
          :highlighted="
            highlightedMessageKey ===
            `${message.ref.channelRef}:${message.ref.messageServerId || message.ref.messageClientId}`
          "
          :menu-open-up="index >= messages.length - 2"
          :active-conversation="activeConversation"
          :recent-conversations="recentConversations"
          :current-session-available="currentSessionAvailable"
          :runtimes="runtimes"
          :default-runtime-id="defaultRuntimeId"
          :selection-mode="selectionMode"
          :selected="isMessageSelected(message)"
          :voice-transcript="voiceTranscript(message)"
          :voice-transcription-available="voiceTranscriptionAvailable"
          :voice-playback="voicePlayback(message)"
          :voice-playback-rate="voicePlaybackRate"
          :voice-playback-available="voicePlaybackAvailable"
          :media-save="mediaSave(message)"
          :media-saving-available="mediaSavingAvailable"
          @forward-to-agent="(action, id) => emit('forwardToAgent', { message, action, id })"
          @action="(action) => emit('messageAction', { message, action })"
          @quick-comment="(type, active) => handleQuickComment(message, type, active)"
          @toggle-selection="emit('toggleMessageSelection', message)"
          @open-merged="emit('openMerged', message)"
          @open-receipt-details="emit('openReceiptDetails', message)"
          @transcribe-voice="emit('transcribeVoice', message)"
          @toggle-voice-playback="emit('toggleVoicePlayback', message)"
          @retry-voice-playback="emit('retryVoicePlayback', message)"
          @seek-voice-playback="(positionMs) => emit('seekVoicePlayback', { message, positionMs })"
          @set-voice-playback-rate="emit('setVoicePlaybackRate', $event)"
          @open-media="emit('openMedia', message)"
          @save-media="emit('saveMedia', message)"
          @cancel-media-save="emit('cancelMediaSave', message)"
          @retry-media-save="emit('retryMediaSave', message)"
        />
        <ChannelOutgoingMessageItem
          v-for="attempt in outgoingAttempts"
          :key="attempt.attemptId"
          :attempt="attempt"
          @retry="emit('retryOutgoing', attempt.attemptId)"
          @cancel="emit('cancelOutgoing', attempt.attemptId)"
          @dismiss="emit('dismissOutgoing', attempt.attemptId)"
        />
        <div v-if="hasMoreNewer" class="flex justify-center pt-2">
          <TeaButton appearance="ghost" size="small" :disabled="loading" @click="emit('loadNewer')">
            {{ loading ? t('channels.history.loadingNewer') : t('channels.history.loadNewer') }}
          </TeaButton>
        </div>
      </div>
    </div>

    <div v-if="selectionMode" class="channel-selection-bar shrink-0 px-3 py-2.5 sm:px-4">
      <div class="channel-selection-shell mx-auto w-full max-w-4xl">
        <div class="flex min-w-0 items-center gap-2">
          <TeaIconButton
            size="small"
            :label="t('channels.selection.cancel')"
            icon="i-mdi-close"
            @click="emit('cancelSelection')"
          />
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {{
              t('channels.selection.count', { count: selectedCount, limit: FORWARD_MESSAGE_LIMIT })
            }}
          </span>
          <TeaButton appearance="ghost" size="small" @click="emit('selectAllVisible')">
            {{ t('channels.selection.selectAll') }}
          </TeaButton>
        </div>
        <div class="channel-selection-actions flex items-center justify-end gap-2">
          <TeaButton
            size="small"
            :disabled="!canForwardIndividual"
            @click="emit('forwardSelection', 'individual')"
          >
            <span class="i-mdi-forward size-4" aria-hidden="true" />
            {{ t('channels.selection.individual') }}
          </TeaButton>
          <TeaButton
            appearance="primary"
            size="small"
            :disabled="!canForwardMerged"
            @click="emit('forwardSelection', 'merged')"
          >
            <span class="i-mdi-file-multiple-outline size-4" aria-hidden="true" />
            {{ t('channels.selection.merged') }}
          </TeaButton>
        </div>
      </div>
    </div>

    <div v-else class="channel-composer-bar shrink-0 px-3 py-2.5 sm:px-4">
      <div class="mx-auto w-full max-w-4xl">
        <ChannelComposer
          :channel="channel"
          :draft="draft"
          :draft-mentions="draftMentions"
          :reply-to="replyTo"
          :attachments="attachments"
          :mention-members="mentionMembers"
          :mention-members-loading="mentionMembersLoading"
          :draft-saving="draftSaving"
          :draft-error-code="draftErrorCode"
          :draft-has-unresolved-delivery="draftHasUnresolvedDelivery"
          @send="emit('send', $event)"
          @pick-attachments="emit('pickAttachments')"
          @remove-attachment="emit('removeAttachment', $event)"
          @cancel-reply="emit('cancelReply')"
          @request-mention-members="emit('requestMentionMembers')"
          @update-draft="emit('updateDraft', $event)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.channel-composer-bar {
  border-top: 1px solid var(--tea-line-soft);
  background: var(--tea-panel);
}
.channel-selection-bar {
  min-height: 6.5rem;
  border-top: 1px solid var(--tea-line-soft);
  background: var(--tea-panel);
}
.channel-selection-shell {
  display: grid;
  gap: 0.5rem;
}
.channel-selection-actions {
  min-width: 0;
}
@media (min-width: 640px) {
  .channel-selection-bar {
    min-height: 3.75rem;
  }
  .channel-selection-shell {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
}
</style>
