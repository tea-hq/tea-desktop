<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaDrawer } from '@/shared/ui'
import type {
  Channel,
  ChannelAttachment,
  ChannelMember,
  ChannelThread,
  Message,
  MessageMention,
  OutgoingMessageAttempt,
} from '../contracts'
import ChannelComposer from './ChannelComposer.vue'
import ChannelMessageItem from './ChannelMessageItem.vue'
import ChannelOutgoingMessageItem from './ChannelOutgoingMessageItem.vue'

const props = withDefaults(
  defineProps<{
    channel: Channel
    rootMessage: Message | null
    thread: ChannelThread | null
    loading: boolean
    errorCode: string | null
    outgoingAttempts?: OutgoingMessageAttempt[]
    attachments?: ChannelAttachment[]
    mentionMembers?: ChannelMember[]
    mentionMembersLoading?: boolean
  }>(),
  {
    outgoingAttempts: () => [],
    attachments: () => [],
    mentionMembers: () => [],
    mentionMembersLoading: false,
  },
)

const emit = defineEmits<{
  close: []
  retry: []
  send: [
    payload: {
      text: string
      replyTo: null
      attachments: ChannelAttachment[]
      mentions: MessageMention[]
    },
  ]
  pickAttachments: []
  removeAttachment: [token: string]
  requestMentionMembers: []
  updateDraft: [payload: { text: string; mentions: MessageMention[] }]
  retryOutgoing: [attemptId: string]
  cancelOutgoing: [attemptId: string]
  dismissOutgoing: [attemptId: string]
}>()
const { t } = useI18n()
const draft = ref('')
const draftMentions = ref<MessageMention[]>([])
const sending = computed(() =>
  props.outgoingAttempts.some((attempt) => attempt.status === 'sending'),
)

watch(
  () => [props.rootMessage?.ref, props.thread?.root.ref],
  () => {
    draft.value = ''
    draftMentions.value = []
  },
  { deep: true },
)

function submit(payload: {
  text: string
  replyTo: Message | null
  attachments: ChannelAttachment[]
  mentions: MessageMention[]
}): void {
  if (!props.thread || sending.value) return
  draft.value = ''
  draftMentions.value = []
  emit('send', { ...payload, replyTo: null })
}
</script>

<template>
  <TeaDrawer
    :open="true"
    :title="t('channels.thread.title')"
    appearance="quiet"
    width="default"
    :close-label="t('channels.thread.close')"
    @close="emit('close')"
  >
    <div class="flex min-h-full flex-col">
      <section v-if="rootMessage" class="border-b border-line-soft px-1 py-3">
        <p class="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
          {{ t('channels.thread.root') }}
        </p>
        <ChannelMessageItem
          :message="thread?.root ?? rootMessage"
          :menu-open-up="false"
          :active-conversation="null"
          :recent-conversations="[]"
          :current-session-available="false"
          :runtimes="[]"
          :default-runtime-id="null"
          :interactive="false"
        />
      </section>

      <section class="min-w-0 flex-1 px-1 py-3">
        <div
          v-if="loading && !thread"
          class="flex min-h-48 items-center justify-center gap-2 text-sm text-subtle"
          role="status"
        >
          <span
            class="i-mdi-loading size-5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{{ t('channels.thread.loading') }}</span>
        </div>
        <div
          v-else-if="errorCode"
          class="flex min-h-48 flex-col items-center justify-center px-6 text-center"
          role="alert"
        >
          <span class="i-mdi-alert-circle-outline size-6 text-danger" aria-hidden="true" />
          <p class="mt-2 text-sm text-danger">
            {{ t('channels.thread.error', { code: errorCode }) }}
          </p>
          <button
            type="button"
            class="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line px-3 text-sm text-fg transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            :aria-label="t('channels.thread.retry')"
            @click="emit('retry')"
          >
            <span class="i-mdi-refresh size-4" aria-hidden="true" />
            {{ t('channels.thread.retry') }}
          </button>
        </div>
        <template v-else-if="thread">
          <div class="flex items-center justify-between gap-3 px-4 pb-2">
            <h3 class="text-sm font-semibold text-fg">
              {{ t('channels.thread.replies', { count: thread.replyCount }) }}
            </h3>
            <span v-if="loading" class="flex items-center gap-1 text-xs text-subtle" role="status">
              <span
                class="i-mdi-loading size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {{ t('channels.thread.loading') }}
            </span>
          </div>
          <div v-if="thread.replies.length" class="divide-y divide-line-soft">
            <ChannelMessageItem
              v-for="reply in thread.replies"
              :key="reply.ref.messageServerId || reply.ref.messageClientId"
              :message="reply"
              :menu-open-up="false"
              :active-conversation="null"
              :recent-conversations="[]"
              :current-session-available="false"
              :runtimes="[]"
              :default-runtime-id="null"
              :interactive="false"
            />
          </div>
          <p v-else class="px-4 py-8 text-center text-sm text-subtle">
            {{ t('channels.thread.empty') }}
          </p>
        </template>
        <div v-if="outgoingAttempts.length" class="mt-2 divide-y divide-line-soft">
          <p class="px-4 pb-2 text-xs font-medium text-subtle">
            {{ t('channels.thread.pending') }}
          </p>
          <ChannelOutgoingMessageItem
            v-for="attempt in outgoingAttempts"
            :key="attempt.attemptId"
            :attempt="attempt"
            @retry="emit('retryOutgoing', attempt.attemptId)"
            @cancel="emit('cancelOutgoing', attempt.attemptId)"
            @dismiss="emit('dismissOutgoing', attempt.attemptId)"
          />
        </div>
      </section>
    </div>

    <template #footer>
      <ChannelComposer
        :channel="channel"
        :draft="draft"
        :draft-mentions="draftMentions"
        :attachments="attachments"
        :mention-members="mentionMembers"
        :mention-members-loading="mentionMembersLoading"
        :disabled="!thread || sending"
        :send-label="t('channels.thread.send')"
        :input-label="t('channels.thread.reply')"
        :placeholder="t('channels.thread.placeholder', { channel: channel.name })"
        @send="submit"
        @pick-attachments="emit('pickAttachments')"
        @remove-attachment="emit('removeAttachment', $event)"
        @request-mention-members="emit('requestMentionMembers')"
        @update-draft="
          (payload) => {
            draft = payload.text
            draftMentions = payload.mentions
            emit('updateDraft', payload)
          }
        "
      />
    </template>
  </TeaDrawer>
</template>
