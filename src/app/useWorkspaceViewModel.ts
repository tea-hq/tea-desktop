import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentRoleOption, ModelOption } from '@/features/conversation/contracts'
import { mergeModelOptions, runtimeModelOptions } from '@/features/conversation/modelOptions'
import type { TeaDesktopStores } from './desktopAppDependencies'
import type { WorkspaceUiState } from './desktopAppState'

export function useWorkspaceViewModel(stores: TeaDesktopStores, ui: WorkspaceUiState) {
  const { conversation, channels, collaboration, agentDrawer, agentRoles, managedRuntime } = stores
  const { t } = useI18n()

  const roleOptions = computed<AgentRoleOption[]>(() =>
    agentRoles.roles
      .filter((role) => role.enabled)
      .map((role) => ({
        id: role.id,
        name: role.name,
        revision: role.revision,
        runtimeId: role.runtimeId,
        description: role.description,
        prompt: role.userPromptTemplate || role.systemPrompt || '',
        skills: [...role.skills],
      })),
  )
  const activeAgentDrawerState = computed(() =>
    channels.activeChannel && collaboration.activeBinding
      ? agentDrawer.ensureState(collaboration.activeBinding)
      : null,
  )
  const collaborationDraft = computed(() =>
    collaboration.activeBinding ? agentDrawer.ensureState(collaboration.activeBinding).draft : null,
  )
  const fullComposerText = computed({
    get: () =>
      ui.collaborationWorkspace.value
        ? (collaborationDraft.value?.text ?? '')
        : ui.localComposerText.value,
    set: (value) => {
      if (ui.collaborationWorkspace.value && collaboration.activeBinding)
        agentDrawer.updateDraft(collaboration.activeBinding, { text: value })
      else ui.localComposerText.value = value
    },
  })
  const fullComposerAttachments = computed({
    get: () =>
      ui.collaborationWorkspace.value
        ? (collaborationDraft.value?.attachments ?? [])
        : ui.localComposerAttachments.value,
    set: (value) => {
      if (ui.collaborationWorkspace.value && collaboration.activeBinding)
        agentDrawer.updateDraft(collaboration.activeBinding, { attachments: value })
      else ui.localComposerAttachments.value = value
    },
  })
  const errorText = computed(() => {
    const error = ui.collaborationWorkspace.value ? collaboration.error : conversation.error
    if (!error) return null
    return error.kind === 'localized' ? t(error.key, error.params ?? {}) : error.message
  })
  const collaborationErrorText = computed(() => {
    const error = collaboration.error
    if (!error) return null
    return error.kind === 'localized' ? t(error.key, error.params ?? {}) : error.message
  })
  const dialogDraft = computed(
    () =>
      collaboration.collaboration.drafts.find(
        (value) => value.draftId === ui.draftDialogId.value,
      ) ?? null,
  )
  const dialogDelivery = computed(() =>
    dialogDraft.value
      ? collaboration.collaboration.deliveries.find(
          (value) =>
            value.draftId === dialogDraft.value!.draftId &&
            value.draftVersion === dialogDraft.value!.currentVersion,
        )
      : undefined,
  )
  const recentCollaborationConversations = computed(() => collaboration.conversations.slice(0, 4))
  const currentChannelSessionAvailable = computed(() => {
    const active = collaboration.activeConversation
    const binding = collaboration.activeBinding
    return Boolean(
      active?.channelBinding &&
      binding &&
      active.channelBinding.transportId === binding.transportId &&
      active.channelBinding.accountRef === binding.accountRef &&
      active.channelBinding.channelRef === binding.channelRef,
    )
  })
  const conversationModelOptions = computed<ModelOption[]>(() =>
    mergeModelOptions(conversation.modelOptions, managedRuntime.modelOptions),
  )
  const collaborationModelOptions = computed<ModelOption[]>(() =>
    mergeModelOptions(
      runtimeModelOptions(collaboration.activeRuntime),
      managedRuntime.modelOptions,
    ),
  )

  return {
    roleOptions,
    activeAgentDrawerState,
    collaborationDraft,
    fullComposerText,
    fullComposerAttachments,
    errorText,
    collaborationErrorText,
    dialogDraft,
    dialogDelivery,
    recentCollaborationConversations,
    currentChannelSessionAvailable,
    conversationModelOptions,
    collaborationModelOptions,
  }
}
