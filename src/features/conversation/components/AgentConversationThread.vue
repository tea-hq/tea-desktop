<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaEmptyState, TeaMessageBar } from '@/shared/ui'
import type { ApprovalDecision, ConversationTurn } from '../contracts'
import type { ConversationTurnContext } from '@/types/channelCollaboration'
import ConversationTurnView from './ConversationTurn.vue'

defineProps<{
  turns: ConversationTurn[]
  turnContexts?: ConversationTurnContext[]
  draftBlockIds?: string[]
  collaboration?: boolean
  loading?: boolean
  loadingOlder?: boolean
  hasOlder?: boolean
  error?: string | null
}>()
const emit = defineEmits<{
  loadOlder: []
  retry: []
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
  createDraft: [payload: { turnIndex: number; blockId: string; content: string }]
}>()
const container = ref<HTMLElement | null>(null)
const { t } = useI18n()

async function loadOlder(): Promise<void> {
  const element = container.value
  const previousHeight = element?.scrollHeight ?? 0
  const previousTop = element?.scrollTop ?? 0
  emit('loadOlder')
  await nextTick()
  if (element) element.scrollTop = previousTop + element.scrollHeight - previousHeight
}
</script>

<template>
  <div ref="container" class="agent-thread min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
    <div v-if="hasOlder" class="flex justify-center pb-3">
      <TeaButton size="small" appearance="ghost" :loading="loadingOlder" @click="loadOlder">{{
        t('channels.history.loadMore')
      }}</TeaButton>
    </div>
    <TeaMessageBar v-if="error" tone="error"
      ><span>{{ error }}</span
      ><TeaButton size="small" appearance="ghost" @click="emit('retry')">{{
        t('sidebar.retry')
      }}</TeaButton></TeaMessageBar
    >
    <div
      v-if="loading && turns.length === 0"
      class="flex h-full items-center justify-center"
      aria-busy="true"
    >
      <span class="i-mdi-loading size-5 animate-spin" />
    </div>
    <TeaEmptyState
      v-else-if="turns.length === 0"
      :title="t('messages.empty')"
      icon="i-mdi-message-outline"
    />
    <div v-else class="mx-auto flex w-full max-w-3xl flex-col gap-7">
      <ConversationTurnView
        v-for="(turn, turnIndex) in turns"
        :key="turn.id"
        :turn="turn"
        :turn-index="turnIndex"
        :sources="turnContexts?.find((context) => context.turnIndex === turnIndex)?.sources || []"
        :collaboration="collaboration"
        :draft-exists="turn.blocks.some((block) => draftBlockIds?.includes(block.id))"
        @resolve-approval="emit('resolveApproval', $event)"
        @create-draft="emit('createDraft', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.agent-thread {
  background: var(--tea-canvas);
  scrollbar-width: thin;
}
</style>
