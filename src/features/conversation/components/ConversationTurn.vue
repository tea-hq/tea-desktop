<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApprovalDecision, ConversationTurn } from '../contracts'
import type { ChannelSource } from '@/types/channelCollaboration'
import ChannelSourceCard from '@/features/collaboration/components/ChannelSourceCard.vue'
import MarkdownContent from '../../../shared/ui/MarkdownContent.vue'
import ConversationFailureTip from './ConversationFailureTip.vue'
import ToolCallBlock from './ToolCallBlock.vue'

const props = defineProps<{
  turn: ConversationTurn
  turnIndex?: number
  sources?: ChannelSource[]
  collaboration?: boolean
  draftExists?: boolean
}>()

const emit = defineEmits<{
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
  createDraft: [payload: { turnIndex: number; blockId: string; content: string }]
}>()
const { t } = useI18n()
const turnStatusIcon = computed(() => {
  if (props.turn.status === 'failed') return 'i-mdi-alert-circle-outline'
  if (props.turn.status === 'cancelled') return 'i-mdi-stop-circle-outline'
  return 'i-mdi-loading'
})
const turnStatusLabel = computed(() => t(`messages.status.${props.turn.status}`))
const showTurnStatus = computed(() =>
  ['sending', 'running', 'failed', 'cancelled'].includes(props.turn.status),
)

function showWaitingIndicator(): boolean {
  return (
    props.turn.status === 'sending' ||
    (props.turn.status === 'running' && props.turn.blocks.length === 0)
  )
}
</script>

<template>
  <article class="conversation-turn w-full animate-fade-slide" :data-turn-id="turn.id">
    <div class="flex justify-end">
      <div
        class="conversation-user max-w-[88%] px-3.5 py-2.5 text-sm leading-6 text-fg sm:max-w-[82%]"
      >
        <div v-if="turn.user.attachments.length" class="mb-2 flex flex-wrap justify-end gap-1.5">
          <span
            v-for="attachment in turn.user.attachments"
            :key="attachment"
            class="rounded-pill bg-canvas px-2.5 py-1 text-sm text-dim"
          >
            {{ attachment }}
          </span>
        </div>
        <p class="whitespace-pre-wrap">{{ turn.user.text }}</p>
      </div>
    </div>

    <div v-if="sources?.length" class="flex gap-2 overflow-x-auto pt-3">
      <ChannelSourceCard
        v-for="source in sources"
        :key="source.sourceId"
        class="w-52 shrink-0"
        :source="source"
      />
    </div>

    <div class="conversation-blocks space-y-4 pt-5">
      <div
        v-if="showTurnStatus"
        class="turn-status"
        :class="`turn-status--${turn.status}`"
        role="status"
        aria-live="polite"
      >
        <span
          class="turn-status__icon"
          :class="[
            turnStatusIcon,
            turn.status === 'sending' || turn.status === 'running' ? 'animate-spin' : '',
          ]"
          aria-hidden="true"
        />
        <span>{{ turnStatusLabel }}</span>
      </div>

      <template v-for="block in turn.blocks" :key="block.id">
        <div
          v-if="block.kind === 'assistantText'"
          class="conversation-response group/response"
          :data-sequence="block.sequence"
        >
          <MarkdownContent :source="block.text" :streaming="block.streaming" />
          <TeaButton
            v-if="collaboration && !draftExists && turn.status === 'completed' && !block.streaming"
            appearance="ghost"
            size="small"
            class="mt-2 opacity-0 transition-opacity group-hover/response:opacity-100 focus:opacity-100"
            @click="
              emit('createDraft', {
                turnIndex: turnIndex ?? 0,
                blockId: block.id,
                content: block.text,
              })
            "
          >
            <span class="i-mdi-file-document-edit-outline size-3.5" aria-hidden="true" />
            {{ t('channels.collaboration.createDraft') }}
          </TeaButton>
        </div>

        <ToolCallBlock
          v-else-if="block.kind === 'toolCall'"
          :tool="block"
          :data-sequence="block.sequence"
          @resolve-approval="emit('resolveApproval', $event)"
        />

        <ConversationFailureTip v-else :failure="block.failure" :data-sequence="block.sequence" />
      </template>

      <span v-if="showWaitingIndicator()" class="inline-flex gap-1.5 py-1" aria-hidden="true">
        <span class="h-1.5 w-1.5 rounded-full bg-muted animate-pulse" />
        <span
          class="h-1.5 w-1.5 rounded-full bg-muted animate-pulse"
          style="animation-delay: 150ms"
        />
        <span
          class="h-1.5 w-1.5 rounded-full bg-muted animate-pulse"
          style="animation-delay: 300ms"
        />
      </span>
    </div>
  </article>
</template>

<style scoped>
.conversation-turn {
  color: var(--tea-fg);
}

.conversation-user {
  border-radius: 10px;
  background: var(--tea-panel);
}

.conversation-blocks,
.conversation-response {
  min-width: 0;
}

.turn-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.25;
}

.turn-status__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
}

.turn-status--failed {
  color: var(--tea-danger);
}

.turn-status--cancelled {
  color: var(--tea-dim);
}

@media (prefers-reduced-motion: reduce) {
  .turn-status__icon.animate-spin {
    animation: none;
  }
}
</style>
