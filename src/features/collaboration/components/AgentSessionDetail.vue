<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { drawerAgentProfile } from '@/app/composerProfiles'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import type {
  AgentRoleOption,
  ApprovalDecision,
  ComposerAttachment,
  ConversationTurn,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '@/features/conversation/contracts'
import type { ChannelSourceInput, CollaborationSnapshot } from '@/types/channelCollaboration'
defineProps<{
  title: string
  turns: ConversationTurn[]
  collaboration: CollaborationSnapshot
  text: string
  attachments: ComposerAttachment[]
  sources: ChannelSourceInput[]
  runtimes: RuntimeDescriptor[]
  runtimeId: string | null
  modelOptions: ModelOption[]
  model: string
  permissionMode: PermissionMode
  roles?: AgentRoleOption[]
  roleId?: string | null
  loading?: boolean
  sending?: boolean
  streaming?: boolean
  error?: string | null
}>()
const emit = defineEmits<{
  close: []
  back: []
  expand: []
  send: [payload: { text: string; attachments: ComposerAttachment[] }]
  stop: []
  removeSource: [id: string]
  selectRuntime: [id: string]
  selectModel: [id: string]
  selectPermission: [mode: PermissionMode]
  selectRole: [id: string | null]
  applyRolePrompt: [value: string]
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
  createDraft: [payload: { turnIndex: number; blockId: string; content: string }]
  'update:text': [value: string]
  'update:attachments': [value: ComposerAttachment[]]
}>()
const { t } = useI18n()
const surface = ref<InstanceType<typeof AgentConversationSurface> | null>(null)
onMounted(async () => {
  await nextTick()
  surface.value?.focusComposer?.()
})
</script>
<template>
  <AgentConversationSurface
    ref="surface"
    :profile="drawerAgentProfile"
    :title="title"
    :close-label="t('common.close')"
    :back-label="t('channels.collaboration.back')"
    :expand-label="t('channels.collaboration.expand')"
    :turns="turns"
    :turn-contexts="collaboration.turnContexts"
    :draft-block-ids="collaboration.drafts.map((value) => value.sourceBlockId)"
    collaboration
    :loading="loading"
    :error="error"
    :text="text"
    :attachments="attachments"
    :sources="sources"
    :runtimes="runtimes"
    :runtime-id="runtimeId"
    :model-options="modelOptions"
    :model="model"
    :permission-mode="permissionMode"
    :roles="roles"
    :role-id="roleId"
    :disabled="sending"
    :streaming="streaming"
    @close="emit('close')"
    @back="emit('back')"
    @expand="emit('expand')"
    @send="emit('send', $event)"
    @stop="emit('stop')"
    @remove-source="emit('removeSource', $event)"
    @select-runtime="emit('selectRuntime', $event)"
    @select-model="emit('selectModel', $event)"
    @select-permission="emit('selectPermission', $event)"
    @select-role="emit('selectRole', $event)"
    @resolve-approval="emit('resolveApproval', $event)"
    @create-draft="emit('createDraft', $event)"
    @apply-role-prompt="emit('applyRolePrompt', $event)"
    @update:text="emit('update:text', $event)"
    @update:attachments="emit('update:attachments', $event)"
  />
</template>
