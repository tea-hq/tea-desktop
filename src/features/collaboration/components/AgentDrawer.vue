<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaDrawer } from '@/shared/ui'
import type { AgentDrawerChannelState } from '../agentDrawerContracts'
import type {
  AgentRoleOption,
  ApprovalDecision,
  ComposerAttachment,
  ConversationSummary,
  ConversationTurn,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '@/features/conversation/contracts'
import type { CollaborationSnapshot } from '@/types/channelCollaboration'
import AgentSessionDetail from './AgentSessionDetail.vue'
import AgentSessionIndex from './AgentSessionIndex.vue'
defineProps<{
  open: boolean
  channelName: string
  state: AgentDrawerChannelState
  conversations: ConversationSummary[]
  turns: ConversationTurn[]
  collaboration: CollaborationSnapshot
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId?: string | null
  modelOptions: ModelOption[]
  roles?: AgentRoleOption[]
  loading?: boolean
  sending?: boolean
  streaming?: boolean
  error?: string | null
  hasMore?: boolean
}>()
const emit = defineEmits<{
  close: []
  select: [id: string]
  create: []
  createWithRuntime: [runtimeId: string]
  viewAll: []
  updateQuery: [value: string]
  selectRuntime: [id: string]
  updateText: [value: string]
  updateAttachments: [value: ComposerAttachment[]]
  selectModel: [value: string]
  selectPermission: [value: PermissionMode]
  selectRole: [value: string | null]
  applyRolePrompt: [value: string]
  send: [payload: { text: string; attachments: ComposerAttachment[] }]
  stop: []
  back: []
  expand: []
  removeSource: [id: string]
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
  createDraft: [payload: { turnIndex: number; blockId: string; content: string }]
  loadMore: []
}>()
const { t } = useI18n()
</script>
<template>
  <TeaDrawer
    :open="open"
    :title="t('channels.collaboration.title')"
    :close-label="t('common.close')"
    @close="emit('close')"
  >
    <AgentSessionIndex
      v-if="state.phase === 'index'"
      :conversations="conversations"
      :runtimes="runtimes"
      :default-runtime-id="defaultRuntimeId"
      :mode="state.listMode"
      :query="state.query"
      :loading="loading"
      :has-more="hasMore"
      @select="emit('select', $event)"
      @create="emit('create')"
      @create-with-runtime="emit('createWithRuntime', $event)"
      @view-all="emit('viewAll')"
      @update-query="emit('updateQuery', $event)"
      @load-more="emit('loadMore')"
    />
    <AgentSessionDetail
      v-else
      :channel-name="channelName"
      :title="
        state.phase === 'preparing' || state.phase === 'creating'
          ? t('channels.collaboration.newSession')
          : conversations.find((value) => value.conversationId === state.selectedConversationId)
              ?.title || t('sidebar.untitled')
      "
      :turns="turns"
      :collaboration="collaboration"
      :text="state.draft.text"
      :attachments="state.draft.attachments"
      :sources="state.draft.sources"
      :runtimes="runtimes"
      :runtime-id="state.draft.runtimeId"
      :model-options="modelOptions"
      :model="state.draft.model"
      :permission-mode="state.draft.permissionMode"
      :roles="roles"
      :role-id="state.draft.roleId"
      :loading="loading || state.phase === 'creating'"
      :sending="sending"
      :streaming="streaming"
      :error="error"
      @back="emit('back')"
      @expand="emit('expand')"
      @send="emit('send', $event)"
      @stop="emit('stop')"
      @remove-source="emit('removeSource', $event)"
      @select-runtime="emit('selectRuntime', $event)"
      @select-model="emit('selectModel', $event)"
      @select-permission="emit('selectPermission', $event)"
      @select-role="emit('selectRole', $event)"
      @apply-role-prompt="emit('applyRolePrompt', $event)"
      @resolve-approval="emit('resolveApproval', $event)"
      @create-draft="emit('createDraft', $event)"
      @update:text="emit('updateText', $event)"
      @update:attachments="emit('updateAttachments', $event)"
    />
  </TeaDrawer>
</template>
