<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaEmptyState, TeaMessageBar } from '@/shared/ui'
import type { ApprovalDecision, ConversationTurn } from '../contracts'
import type { AgentRoleOption } from '../contracts'
import type { ConversationTurnContext } from '@/types/channelCollaboration'
import ConversationTurnView from './ConversationTurn.vue'
import AgentRolePickerCard from './AgentRolePickerCard.vue'

const props = defineProps<{
  turns: ConversationTurn[]
  roles?: AgentRoleOption[]
  runtimeId?: string | null
  roleId?: string | null
  roleDisabled?: boolean
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
  selectRole: [value: string]
  applyRolePrompt: [value: string]
}>()
const container = ref<HTMLElement | null>(null)
const { t } = useI18n()
type ScrollSnapshot = { scrollHeight: number; scrollTop: number; turnCount: number }

const pendingOlderScroll = ref<ScrollSnapshot | null>(null)
let pendingInitialScroll = false

function scrollToBottom(): void {
  const element = container.value
  if (element) element.scrollTop = element.scrollHeight
}

watch(
  () =>
    [
      props.turns.length,
      props.turns[0]?.id ?? null,
      Boolean(props.loading),
      Boolean(props.loadingOlder),
    ] as const,
  async ([turnCount, firstTurnId, isLoading, isLoadingOlder], previous) => {
    const previousLoading = previous?.[2] ?? false

    if (isLoading) {
      if (!previousLoading) {
        pendingInitialScroll = true
        pendingOlderScroll.value = null
      }
      return
    }

    if (pendingOlderScroll.value && !isLoadingOlder) {
      const snapshot = pendingOlderScroll.value
      pendingOlderScroll.value = null
      if (turnCount <= snapshot.turnCount) return
      await nextTick()
      const element = container.value
      if (element)
        element.scrollTop = snapshot.scrollTop + element.scrollHeight - snapshot.scrollHeight
      return
    }

    if (isLoadingOlder || turnCount === 0) return

    const shouldScrollInitialHistory =
      pendingInitialScroll ||
      (!previous && turnCount > 0) ||
      (previous?.[0] === 0 && turnCount > 0) ||
      (previous?.[1] !== firstTurnId && turnCount > 0)
    if (!shouldScrollInitialHistory) return

    pendingInitialScroll = false
    await nextTick()
    scrollToBottom()
  },
  { immediate: true },
)

function loadOlder(): void {
  const element = container.value
  pendingOlderScroll.value = element
    ? {
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        turnCount: props.turns.length,
      }
    : null
  emit('loadOlder')
}
</script>

<template>
  <div ref="container" class="agent-thread min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
    <AgentRolePickerCard
      :roles="roles ?? []"
      :runtime-id="runtimeId ?? null"
      :role-id="roleId"
      :disabled="roleDisabled"
      @select-role="emit('selectRole', $event)"
      @apply-prompt="emit('applyRolePrompt', $event)"
    />
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
    <div v-else class="conversation-turns mx-auto flex w-full max-w-3xl flex-col gap-8">
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
}

.conversation-turns {
  min-width: 0;
}
</style>
