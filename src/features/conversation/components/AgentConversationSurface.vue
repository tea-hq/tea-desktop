<script setup lang="ts">
import { ref } from 'vue'
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

const composer = ref<InstanceType<typeof AgentConversationComposer> | null>(null)

defineProps<{
  profile: ComposerProfile
  title: string
  subtitle?: string
  runtimeLabel?: string
  backLabel?: string
  expandLabel?: string
  turns: ConversationTurn[]
  turnContexts?: ConversationTurnContext[]
  draftBlockIds?: string[]
  collaboration?: boolean
  loading?: boolean
  loadingOlder?: boolean
  hasOlder?: boolean
  error?: string | null
  text: string
  attachments: ComposerAttachment[]
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
function focusComposer(): void {
  composer.value?.focus()
}
defineExpose({ focusComposer })
const emit = defineEmits<{
  back: []
  expand: []
  loadOlder: []
  retry: []
  stop: []
  removeSource: [id: string]
  send: [payload: { text: string; attachments: ComposerAttachment[] }]
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
  createDraft: [payload: { turnIndex: number; blockId: string; content: string }]
  'update:text': [value: string]
  'update:attachments': [value: ComposerAttachment[]]
  selectRuntime: [value: string]
  selectModel: [value: string]
  selectPermission: [value: PermissionMode]
  selectRole: [value: string | null]
  applyRolePrompt: [value: string]
}>()
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col">
    <AgentConversationHeader
      :title="title"
      :subtitle="subtitle"
      :runtime-label="profile.showHeaderRuntime ? runtimeLabel : ''"
      :back-label="backLabel"
      :expand-label="expandLabel"
      @back="emit('back')"
      @expand="emit('expand')"
    />
    <AgentConversationThread
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
      @load-older="emit('loadOlder')"
      @retry="emit('retry')"
      @resolve-approval="emit('resolveApproval', $event)"
      @create-draft="emit('createDraft', $event)"
      @select-role="emit('selectRole', $event)"
      @apply-role-prompt="emit('applyRolePrompt', $event)"
    />
    <AgentConversationComposer
      ref="composer"
      :profile="profile"
      :text="text"
      :attachments="attachments"
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
      @select-runtime="emit('selectRuntime', $event)"
      @select-model="emit('selectModel', $event)"
      @select-permission="emit('selectPermission', $event)"
      @remove-source="emit('removeSource', $event)"
      @send="emit('send', $event)"
      @stop="emit('stop')"
    />
  </section>
</template>
