<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ComposerProfile } from '@/app/composerProfiles'
import type { ChannelSourceInput, ConversationTurnContext } from '@/types/channelCollaboration'
import type {
  AgentRoleOption,
  ApprovalDecision,
  ComposerAttachment,
  ConversationTurn,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '../contracts'
import AgentConversationComposer from './AgentConversationComposer.vue'
import AgentConversationHeader from './AgentConversationHeader.vue'
import AgentConversationThread from './AgentConversationThread.vue'
import type { AgentWorkMode } from './AgentWorkModeMenu.vue'

const composer = ref<InstanceType<typeof AgentConversationComposer> | null>(null)

const props = defineProps<{
  profile: ComposerProfile
  title: string
  subtitle?: string
  runtimeLabel?: string
  backLabel?: string
  expandLabel?: string
  closeLabel?: string
  turns: ConversationTurn[]
  turnContexts?: ConversationTurnContext[]
  draftBlockIds?: string[]
  collaboration?: boolean
  loading?: boolean
  loadingOlder?: boolean
  hasOlder?: boolean
  error?: string | null
  errorRetryable?: boolean
  workspaceRecoveryAvailable?: boolean
  text: string
  attachments: ComposerAttachment[]
  workingDirectory?: string | null
  projectDirectories?: string[]
  agentMode?: AgentWorkMode
  newConversation?: boolean
  sources?: ChannelSourceInput[]
  runtimes: RuntimeDescriptor[]
  runtimeId: string | null
  modelOptions: ModelOption[]
  model: string
  permissionMode: PermissionMode
  roles?: AgentRoleOption[]
  roleId?: string | null
  disabled?: boolean
  streaming?: boolean
}>()
const centeredEmpty = computed(
  () =>
    props.profile.id === 'full' &&
    props.turns.length === 0 &&
    !props.loading &&
    !props.streaming &&
    !props.error,
)
function focusComposer(): void {
  composer.value?.focus()
}
defineExpose({ focusComposer })
const emit = defineEmits<{
  close: []
  back: []
  expand: []
  loadOlder: []
  retry: []
  recoverWorkspace: []
  stop: []
  removeSource: [id: string]
  send: [payload: { text: string; attachments: ComposerAttachment[] }]
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
  createDraft: [payload: { turnIndex: number; blockId: string; content: string }]
  'update:text': [value: string]
  'update:attachments': [value: ComposerAttachment[]]
  'update:workingDirectory': [value: string | null]
  'new-project': []
  'update:agentMode': [value: AgentWorkMode]
  selectRuntime: [value: string]
  selectModel: [value: string]
  selectPermission: [value: PermissionMode]
  selectRole: [value: string | null]
  applyRolePrompt: [value: string]
}>()
</script>

<template>
  <section
    class="agent-conversation-surface flex h-full min-h-0 min-w-0 flex-col"
    :class="centeredEmpty ? 'agent-conversation-surface--empty' : ''"
  >
    <AgentConversationHeader
      :title="title"
      :subtitle="profile.id === 'drawer' ? '' : subtitle"
      :runtime-label="profile.showHeaderRuntime ? runtimeLabel : ''"
      :back-label="backLabel"
      :expand-label="expandLabel"
      :close-label="closeLabel"
      :compact="profile.id === 'drawer'"
      @close="emit('close')"
      @back="emit('back')"
      @expand="emit('expand')"
    />
    <AgentConversationThread
      v-if="!centeredEmpty"
      :turns="turns"
      :roles="roles"
      :runtime-id="runtimeId"
      :role-id="roleId"
      :role-disabled="disabled"
      :turn-contexts="turnContexts"
      :draft-block-ids="draftBlockIds"
      :collaboration="collaboration"
      :loading="loading"
      :loading-older="loadingOlder"
      :has-older="hasOlder"
      :error="error"
      :error-retryable="errorRetryable"
      :workspace-recovery-available="workspaceRecoveryAvailable"
      @load-older="emit('loadOlder')"
      @retry="emit('retry')"
      @recover-workspace="emit('recoverWorkspace')"
      @resolve-approval="emit('resolveApproval', $event)"
      @create-draft="emit('createDraft', $event)"
      @select-role="emit('selectRole', $event)"
      @apply-role-prompt="emit('applyRolePrompt', $event)"
    />
    <AgentConversationComposer
      ref="composer"
      :profile="profile"
      :centered="centeredEmpty"
      :text="text"
      :attachments="attachments"
      :working-directory="workingDirectory"
      :project-directories="projectDirectories"
      :agent-mode="agentMode"
      :new-conversation="newConversation"
      :sources="sources"
      :runtimes="runtimes"
      :runtime-id="runtimeId"
      :model-options="modelOptions"
      :model="model"
      :permission-mode="permissionMode"
      :disabled="disabled"
      :streaming="streaming"
      @update:text="emit('update:text', $event)"
      @update:attachments="emit('update:attachments', $event)"
      @update:working-directory="emit('update:workingDirectory', $event)"
      @new-project="emit('new-project')"
      @update:agent-mode="emit('update:agentMode', $event)"
      @select-runtime="emit('selectRuntime', $event)"
      @select-model="emit('selectModel', $event)"
      @select-permission="emit('selectPermission', $event)"
      @remove-source="emit('removeSource', $event)"
      @send="emit('send', $event)"
      @stop="emit('stop')"
    />
  </section>
</template>

<style scoped>
.agent-conversation-surface {
  --agent-conversation-content-width: 735px;
}

.agent-conversation-surface--empty :deep(.agent-composer) {
  flex: 0 1 auto;
  width: 100%;
  margin-block: auto;
  border-top: 0;
  background: var(--tea-canvas);
}
</style>
