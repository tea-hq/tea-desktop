<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import { TeaButton, TeaIconButton, TeaTextarea } from '@/shared/ui'

import type {
  Channel,
  ChannelAttachment,
  ChannelMember,
  ChannelPresence,
  ChannelVoicePlaybackRate,
  ChannelVoicePlaybackState,
  ChannelVoiceTranscript,
  Message,
  MessageMention,
  MessageMentionTarget,
  OutgoingMessageAttempt,
} from '../contracts'
import type { ForwardMessageMode } from '../contracts'
import { collectMessageMentions, type SelectedMessageMention } from '../messageMentions'
import { FORWARD_MESSAGE_LIMIT } from '../messageForwarding'
import { messageSelectionKey } from '../useChannelMessageSelection'
import { sameMessage } from '../projection'
import ChannelMessageItem from './ChannelMessageItem.vue'
import ChannelOutgoingMessageItem from './ChannelOutgoingMessageItem.vue'
import ChannelPresenceIndicator from './ChannelPresenceIndicator.vue'
import type { MessageAction } from './ChannelMessageActions.vue'
import {
  isTimelineNearBottom,
  restorePrependScrollTop,
  type TimelineScrollSnapshot,
} from './channelTimelineScroll'

const props = withDefaults(
  defineProps<{
    channel: Channel
    messages: Message[]
    outgoingAttempts?: OutgoingMessageAttempt[]
    panelOpen: boolean
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
}>()
const { t } = useI18n()
const selectedMentions = ref<SelectedMessageMention[]>([])
const activeMentionIndex = ref(0)
const requestedMentionChannel = ref('')
const container = ref<HTMLElement | null>(null)
const initialScrollPending = ref(true)
const prependSnapshot = ref<(TimelineScrollSnapshot & { messageCount: number }) | null>(null)

interface MentionOption {
  key: string
  target: MessageMentionTarget
  label: string
  name: string
  detail: string
}

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

const mentionContext = computed(() => {
  if (props.channel.kind !== 'group') return null
  const match = props.draft.match(/(?:^|\s)@([^\s@]*)$/u)
  if (!match) return null
  return {
    query: (match[1] ?? '').toLocaleLowerCase(),
    start: props.draft.length - (match[1]?.length ?? 0) - 1,
    end: props.draft.length,
  }
})

const mentionOptions = computed<MentionOption[]>(() => {
  const context = mentionContext.value
  if (!context) return []
  const query = context.query
  const options: MentionOption[] = []
  if ('channel'.includes(query)) {
    options.push({
      key: 'channel',
      target: { kind: 'channel' },
      label: '@channel',
      name: '@channel',
      detail: t('channels.mentions.channelDescription'),
    })
  }
  for (const member of props.mentionMembers) {
    const haystack = `${member.name} ${member.accountId}`.toLocaleLowerCase()
    if (query && !haystack.includes(query)) continue
    options.push({
      key: `user:${member.accountId}`,
      target: { kind: 'user', accountId: member.accountId },
      label: `@${member.name}`,
      name: member.name,
      detail: member.accountId,
    })
    if (options.length >= 8) break
  }
  return options
})

const mentionMenuOpen = computed(() => mentionContext.value !== null)

function submitMessage(): void {
  const text = props.draft.trim()
  if (!text && !props.attachments.length) return
  emit('send', {
    text,
    replyTo: props.replyTo,
    attachments: props.attachments,
    mentions: collectMessageMentions(text, selectedMentions.value),
  })
}

function selectMention(option: MentionOption): void {
  const context = mentionContext.value
  if (!context) return
  const text = `${props.draft.slice(0, context.start)}${option.label} ${props.draft.slice(context.end)}`
  const mentions = [
    ...selectedMentions.value.filter(
      (value) => mentionTargetKey(value.target) !== mentionTargetKey(option.target),
    ),
    { target: option.target, label: option.label },
  ]
  selectedMentions.value = mentions
  emitDraft(text, mentions)
  activeMentionIndex.value = 0
}

function updateDraftText(text: string): void {
  const mentions = collectMessageMentions(text, selectedMentions.value).map(
    ({ target, label }) => ({
      target,
      label,
    }),
  )
  selectedMentions.value = mentions
  emitDraft(text, mentions)
}

function emitDraft(text: string, mentions = selectedMentions.value): void {
  emit('updateDraft', { text, mentions: collectMessageMentions(text, mentions) })
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (mentionMenuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!mentionOptions.value.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      activeMentionIndex.value =
        (activeMentionIndex.value + direction + mentionOptions.value.length) %
        mentionOptions.value.length
      return
    }
    if (event.key === 'Enter' && mentionOptions.value.length) {
      event.preventDefault()
      selectMention(mentionOptions.value[activeMentionIndex.value] ?? mentionOptions.value[0]!)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      updateDraftText(props.draft.replace(/@([^\s@]*)$/u, '$1'))
      return
    }
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submitMessage()
  }
}

function mentionTargetKey(target: MessageMentionTarget): string {
  return target.kind === 'channel' ? 'channel' : `user:${target.accountId}`
}

function attachmentIcon(kind: ChannelAttachment['kind']): string {
  if (kind === 'image') return 'i-mdi-image-outline'
  if (kind === 'audio') return 'i-mdi-music-note-outline'
  if (kind === 'video') return 'i-mdi-video-outline'
  return 'i-mdi-file-outline'
}

function isMessageSelected(message: Message): boolean {
  return props.selectedMessageKeys.includes(messageSelectionKey(message))
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
    selectedMentions.value = props.draftMentions.map(({ target, label }) => ({ target, label }))
    requestedMentionChannel.value = ''
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
  () => props.draftMentions,
  (mentions) => {
    selectedMentions.value = mentions.map(({ target, label }) => ({ target, label }))
  },
  { deep: true },
)

watch(
  () => mentionContext.value?.query,
  (query) => {
    activeMentionIndex.value = 0
    if (query === undefined || requestedMentionChannel.value === props.channel.ref) return
    requestedMentionChannel.value = props.channel.ref
    emit('requestMentionMembers')
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
          <ChannelPresenceIndicator
            v-if="channel.kind === 'direct' && channel.directAccountId"
            :availability="presence?.availability ?? 'unknown'"
            size="inline"
          />
          <span v-if="channel.memberCount" class="text-sm text-subtle">
            {{ t('channels.members', { count: channel.memberCount }) }}
          </span>
        </div>
        <p class="mt-0.5 truncate text-sm text-subtle">{{ channel.description }}</p>
      </div>
      <div class="flex items-center gap-1">
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
          @forward-to-agent="(action, id) => emit('forwardToAgent', { message, action, id })"
          @action="(action) => emit('messageAction', { message, action })"
          @toggle-selection="emit('toggleMessageSelection', message)"
          @open-merged="emit('openMerged', message)"
          @open-receipt-details="emit('openReceiptDetails', message)"
          @transcribe-voice="emit('transcribeVoice', message)"
          @toggle-voice-playback="emit('toggleVoicePlayback', message)"
          @retry-voice-playback="emit('retryVoicePlayback', message)"
          @seek-voice-playback="(positionMs) => emit('seekVoicePlayback', { message, positionMs })"
          @set-voice-playback-rate="emit('setVoicePlaybackRate', $event)"
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

    <div v-else class="channel-composer-bar relative shrink-0 px-3 py-2.5 sm:px-4">
      <div
        v-if="mentionMenuOpen"
        class="channel-mention-menu absolute left-3 right-3 z-20 mx-auto max-h-72 max-w-xl overflow-y-auto rounded-card border border-line bg-canvas p-1 sm:left-4 sm:right-4"
        :style="{
          bottom: `${4.5 + (replyTo ? 3 : 0) + (attachments.length ? 3 : 0)}rem`,
        }"
        role="listbox"
        :aria-label="t('channels.mentions.suggestions')"
      >
        <div
          v-if="mentionMembersLoading && mentionOptions.length <= 1"
          class="flex items-center gap-2 px-3 py-2 text-sm text-subtle"
        >
          <span class="i-mdi-loading size-4 animate-spin" aria-hidden="true" />
          {{ t('channels.mentions.loading') }}
        </div>
        <div v-else-if="mentionOptions.length === 0" class="px-3 py-2 text-sm text-subtle">
          {{ t('channels.mentions.empty') }}
        </div>
        <TeaButton
          v-for="(option, index) in mentionOptions"
          v-else
          :key="option.key"
          appearance="ghost"
          fluid
          class="flex min-w-0 items-center justify-start gap-2 px-2.5 py-2 text-left"
          :class="index === activeMentionIndex ? 'bg-hover' : ''"
          role="option"
          :aria-selected="index === activeMentionIndex"
          @mouseenter="activeMentionIndex = index"
          @click="selectMention(option)"
        >
          <span
            :class="[
              option.target.kind === 'channel'
                ? 'i-mdi-bullhorn-outline'
                : 'i-mdi-account-circle-outline',
              'size-5 shrink-0 text-subtle',
            ]"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-fg">{{ option.name }}</span>
            <span class="block truncate text-xs text-subtle">{{ option.detail }}</span>
          </span>
        </TeaButton>
      </div>
      <div class="channel-composer-shell mx-auto flex w-full max-w-4xl items-end gap-2">
        <div
          v-if="replyTo"
          class="absolute mb-[3.25rem] flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-card border border-line bg-panel px-3 py-2 text-xs text-subtle"
        >
          <span class="i-mdi-reply-outline size-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">
            {{ t('channels.message.replyingTo', { name: replyTo.sender.name }) }}:
            {{ replyTo.text }}
          </span>
          <TeaIconButton
            size="small"
            :label="t('channels.message.cancelReply')"
            icon="i-mdi-close"
            @click="emit('cancelReply')"
          />
        </div>
        <div
          v-if="attachments.length"
          class="absolute bottom-full left-3 right-3 mb-2 flex max-w-4xl flex-wrap gap-1.5 rounded-card border border-line bg-panel px-2 py-1.5 sm:left-4 sm:right-4 sm:mx-auto"
        >
          <div
            v-for="attachment in attachments"
            :key="attachment.token"
            class="flex min-w-0 max-w-full items-center gap-1 rounded-pill bg-muted px-2 py-1 text-xs text-fg"
          >
            <span
              :class="[attachmentIcon(attachment.kind), 'size-3.5 shrink-0']"
              aria-hidden="true"
            />
            <span class="max-w-48 truncate">{{ attachment.name }}</span>
            <TeaIconButton
              size="small"
              :label="t('channels.composer.removeAttachment', { name: attachment.name })"
              icon="i-mdi-close"
              @click="emit('removeAttachment', attachment.token)"
            />
          </div>
        </div>
        <TeaIconButton
          class="channel-composer-attach"
          size="small"
          :label="t('channels.composer.addAttachment')"
          icon="i-mdi-paperclip"
          @click="emit('pickAttachments')"
        />
        <TeaTextarea
          :model-value="draft"
          class="channel-composer-input min-w-0 flex-1"
          size="compact"
          auto-grow
          :rows="1"
          :label="t('channels.composer.placeholder', { channel: channel.name })"
          :placeholder="t('channels.composer.placeholder', { channel: channel.name })"
          @update:model-value="updateDraftText"
          @keydown="handleComposerKeydown"
        />
        <TeaIconButton
          class="channel-composer-send"
          size="small"
          :label="t('channels.composer.send')"
          icon="i-mdi-arrow-up"
          appearance="primary"
          :disabled="draftHasUnresolvedDelivery || (!draft.trim() && !attachments.length)"
          @click="submitMessage"
        />
      </div>
      <p v-if="draftErrorCode" class="mx-auto mt-1 max-w-4xl text-xs text-danger" role="alert">
        {{ t('channels.drafts.saveError', { code: draftErrorCode }) }}
      </p>
      <p v-else-if="draftSaving" class="sr-only" role="status">
        {{ t('channels.drafts.saving') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.channel-composer-bar {
  border-top: 1px solid var(--tea-line-soft);
  background: var(--tea-panel);
}
.channel-mention-menu {
  max-width: min(32rem, calc(100% - 1.5rem));
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
.channel-composer-shell {
  border: 1px solid var(--tea-line-soft);
  border-radius: var(--tea-radius-card);
  background: var(--tea-canvas);
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
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
.channel-composer-attach {
  margin-bottom: 0.125rem;
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
