<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApprovalDecision, ConversationTurn, ConversationTurnBlock } from '../contracts'
import type { ChannelSource } from '@/types/channelCollaboration'
import ChannelSourceCard from '@/features/collaboration/components/ChannelSourceCard.vue'
import MarkdownContent from '../../../shared/ui/MarkdownContent.vue'
import ConversationFailureTip from './ConversationFailureTip.vue'
import AgentActivityGroup from './AgentActivityGroup.vue'
import AgentWorkingIndicator from './AgentWorkingIndicator.vue'
import TaskNotificationFold from './TaskNotificationFold.vue'
import { parseTaskNotification } from '../taskNotification'

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
const showTurnStatus = computed(() => ['failed', 'cancelled'].includes(props.turn.status))
const taskNotification = computed(() => parseTaskNotification(props.turn.user.text))

type ActivityBlock = Extract<ConversationTurnBlock, { kind: 'agentThought' | 'toolCall' }>
type TurnSegment =
  | { kind: 'assistantText'; block: Extract<ConversationTurnBlock, { kind: 'assistantText' }> }
  | { kind: 'activity'; blocks: ActivityBlock[] }
  | { kind: 'failure'; block: Extract<ConversationTurnBlock, { kind: 'failureTip' }> }

const segments = computed<TurnSegment[]>(() => {
  const result: TurnSegment[] = []
  for (const block of props.turn.blocks) {
    if (block.kind === 'assistantText') {
      result.push({ kind: 'assistantText', block })
      continue
    }
    if (block.kind === 'agentThought' || block.kind === 'toolCall') {
      const previous = result.at(-1)
      if (previous?.kind === 'activity') previous.blocks.push(block)
      else result.push({ kind: 'activity', blocks: [block] })
      continue
    }
    result.push({ kind: 'failure', block })
  }
  return result
})

const showWorkingIndicator = computed(
  () =>
    (props.turn.status === 'sending' || props.turn.status === 'running') &&
    !props.turn.blocks.some((block) => block.kind === 'assistantText' && block.text.trim()),
)
const workingLabel = computed(() => {
  const last = props.turn.blocks.at(-1)
  if (last?.kind === 'toolCall') return t('messages.workingWithTool', { name: last.name })
  if (last?.kind === 'agentThought') return t('messages.thinking')
  return t('messages.working')
})
</script>

<template>
  <article class="conversation-turn w-full animate-fade-slide" :data-turn-id="turn.id">
    <TaskNotificationFold v-if="taskNotification" :notification="taskNotification" />
    <div v-else class="flex justify-end">
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

      <template
        v-for="segment in segments"
        :key="segment.kind === 'activity' ? segment.blocks[0].id : segment.block.id"
      >
        <div
          v-if="segment.kind === 'assistantText'"
          class="conversation-response group/response"
          :data-sequence="segment.block.sequence"
        >
          <MarkdownContent :source="segment.block.text" :streaming="segment.block.streaming" />
          <TeaButton
            v-if="
              collaboration &&
              !draftExists &&
              turn.status === 'completed' &&
              !segment.block.streaming
            "
            appearance="ghost"
            size="small"
            class="mt-2 opacity-0 transition-opacity group-hover/response:opacity-100 focus:opacity-100"
            @click="
              emit('createDraft', {
                turnIndex: turnIndex ?? 0,
                blockId: segment.block.id,
                content: segment.block.text,
              })
            "
          >
            <span class="i-mdi-file-document-edit-outline size-3.5" aria-hidden="true" />
            {{ t('channels.collaboration.createDraft') }}
          </TeaButton>
        </div>

        <AgentActivityGroup
          v-else-if="segment.kind === 'activity'"
          :blocks="segment.blocks"
          @resolve-approval="emit('resolveApproval', $event)"
        />

        <ConversationFailureTip
          v-else
          :failure="segment.block.failure"
          :data-sequence="segment.block.sequence"
        />
      </template>

      <AgentWorkingIndicator v-if="showWorkingIndicator" :label="workingLabel" />
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
