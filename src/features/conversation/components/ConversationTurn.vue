<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
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

function showWaitingIndicator(): boolean {
  return (
    props.turn.status === 'sending' ||
    (props.turn.status === 'running' && props.turn.blocks.length === 0)
  )
}
</script>

<template>
  <article class="w-full bg-surface animate-fade-slide" :data-turn-id="turn.id">
    <div class="flex justify-end px-5 pt-5">
      <div class="max-w-[82%] bg-hover px-3.5 py-2.5 text-base leading-5 text-fg">
        <div v-if="turn.user.attachments.length" class="mb-2 flex flex-wrap justify-end gap-1.5">
          <span
            v-for="attachment in turn.user.attachments"
            :key="attachment"
            class="rounded-structural bg-canvas px-2 py-1 text-sm text-dim"
          >
            {{ attachment }}
          </span>
        </div>
        <p class="whitespace-pre-wrap">{{ turn.user.text }}</p>
      </div>
    </div>

    <div v-if="sources?.length" class="flex gap-2 overflow-x-auto px-5 pt-3">
      <ChannelSourceCard
        v-for="source in sources"
        :key="source.sourceId"
        class="w-52 shrink-0"
        :source="source"
      />
    </div>

    <div class="space-y-3 px-5 pb-5 pt-4">
      <template v-for="block in turn.blocks" :key="block.id">
        <div
          v-if="block.kind === 'assistantText'"
          class="group/response"
          :data-sequence="block.sequence"
        >
          <MarkdownContent :source="block.text" :streaming="block.streaming" />
          <TeaButton
            v-if="collaboration && !draftExists && turn.status === 'completed' && !block.streaming"
            class="mt-2 inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-sm font-medium text-dim opacity-0 transition-opacity hover:bg-pressed hover:text-fg group-hover/response:opacity-100 focus:opacity-100"
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
