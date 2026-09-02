<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaIconButton, TeaTextarea } from '@/shared/ui'
import type {
  Channel,
  ChannelAttachment,
  ChannelMember,
  Message,
  MessageMention,
  MessageMentionTarget,
} from '../contracts'
import { collectMessageMentions, type SelectedMessageMention } from '../messageMentions'

const props = withDefaults(
  defineProps<{
    channel: Channel
    draft?: string
    draftMentions?: MessageMention[]
    replyTo?: Message | null
    attachments?: ChannelAttachment[]
    mentionMembers?: ChannelMember[]
    mentionMembersLoading?: boolean
    draftSaving?: boolean
    draftErrorCode?: string | null
    draftHasUnresolvedDelivery?: boolean
    disabled?: boolean
    sendLabel?: string
    inputLabel?: string
    placeholder?: string
  }>(),
  {
    draft: '',
    draftMentions: () => [],
    replyTo: null,
    attachments: () => [],
    mentionMembers: () => [],
    mentionMembersLoading: false,
    draftSaving: false,
    draftErrorCode: null,
    draftHasUnresolvedDelivery: false,
    disabled: false,
    sendLabel: undefined,
    inputLabel: undefined,
    placeholder: undefined,
  },
)

const emit = defineEmits<{
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
  requestMentionMembers: []
  updateDraft: [payload: { text: string; mentions: MessageMention[] }]
}>()

const { t } = useI18n()
const selectedMentions = ref<SelectedMessageMention[]>([])
const activeMentionIndex = ref(0)
const requestedMentionChannel = ref('')

interface MentionOption {
  key: string
  target: MessageMentionTarget
  label: string
  name: string
  detail: string
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
  const options: MentionOption[] = []
  if ('channel'.includes(context.query)) {
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
    if (context.query && !haystack.includes(context.query)) continue
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
const composerPlaceholder = computed(
  () => props.placeholder ?? t('channels.composer.placeholder', { channel: props.channel.name }),
)

function submitMessage(): void {
  const text = props.draft.trim()
  if (props.disabled || props.draftHasUnresolvedDelivery || (!text && !props.attachments.length))
    return
  emit('send', {
    text,
    replyTo: props.replyTo,
    attachments: props.attachments,
    mentions: collectMessageMentions(text, selectedMentions.value),
  })
}

function selectMention(option: MentionOption): void {
  const context = mentionContext.value
  if (!context || props.disabled) return
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
  if (props.disabled) return
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

watch(
  () => props.channel.ref,
  () => {
    selectedMentions.value = props.draftMentions.map(({ target, label }) => ({ target, label }))
    requestedMentionChannel.value = ''
  },
  { immediate: true },
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
</script>

<template>
  <div class="channel-composer relative w-full">
    <div
      v-if="mentionMenuOpen || replyTo || attachments.length"
      class="absolute bottom-full left-0 right-0 z-20 mb-2 flex flex-col gap-1.5"
    >
      <div
        v-if="mentionMenuOpen"
        class="channel-mention-menu mx-auto max-h-72 w-full overflow-y-auto rounded-card border border-line bg-canvas p-1"
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
      <div
        v-if="replyTo"
        class="flex max-w-full items-center gap-2 rounded-card border border-line bg-panel px-3 py-2 text-xs text-subtle"
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
          :disabled="disabled"
          @click="emit('cancelReply')"
        />
      </div>
      <div
        v-if="attachments.length"
        class="flex max-w-full flex-wrap gap-1.5 rounded-card border border-line bg-panel px-2 py-1.5"
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
            :disabled="disabled"
            @click="emit('removeAttachment', attachment.token)"
          />
        </div>
      </div>
    </div>
    <div class="channel-composer-shell flex min-w-0 items-end gap-2">
      <TeaIconButton
        class="channel-composer-attach"
        size="small"
        :label="t('channels.composer.addAttachment')"
        icon="i-mdi-paperclip"
        :disabled="disabled"
        @click="emit('pickAttachments')"
      />
      <TeaTextarea
        :model-value="draft"
        class="channel-composer-input min-w-0 flex-1"
        size="compact"
        auto-grow
        :rows="1"
        :label="inputLabel ?? composerPlaceholder"
        :placeholder="composerPlaceholder"
        :disabled="disabled"
        @update:model-value="updateDraftText"
        @keydown="handleComposerKeydown"
      />
      <TeaIconButton
        class="channel-composer-send"
        size="small"
        :label="sendLabel ?? t('channels.composer.send')"
        icon="i-mdi-arrow-up"
        appearance="primary"
        :disabled="disabled || draftHasUnresolvedDelivery || (!draft.trim() && !attachments.length)"
        @click="submitMessage"
      />
    </div>
    <p v-if="draftErrorCode" class="mt-1 text-xs text-danger" role="alert">
      {{ t('channels.drafts.saveError', { code: draftErrorCode }) }}
    </p>
    <p v-else-if="draftSaving" class="sr-only" role="status">
      {{ t('channels.drafts.saving') }}
    </p>
  </div>
</template>

<style scoped>
.channel-mention-menu {
  max-width: min(32rem, calc(100% - 1.5rem));
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
.channel-composer-send,
.channel-composer-attach {
  margin-bottom: 0.125rem;
}
</style>
