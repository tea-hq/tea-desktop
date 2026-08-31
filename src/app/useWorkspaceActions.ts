import type {
  ApprovalDecision,
  ComposerAttachment,
  PermissionMode,
} from '@/features/conversation/contracts'
import type { DirectoryUser } from '@/features/directory/contracts'
import type { WorkspaceMode } from '@/app/components/WorkspaceRail.vue'
import { logoutWorkspace } from './logoutWorkspace'
import type { TeaDesktopStores } from './desktopAppDependencies'
import type { WorkspaceUiState } from './desktopAppState'
import type { WorkspaceRuntime } from './useWorkspaceRuntime'
import type { WorkspaceClient } from '@/infrastructure/workspace/electronWorkspaceClient'

export function useWorkspaceActions(
  stores: TeaDesktopStores,
  ui: WorkspaceUiState,
  runtime: WorkspaceRuntime,
  workspaceClient?: WorkspaceClient,
) {
  const { conversation, channels, collaboration, agentDrawer, settings, centerAuth } = stores

  function handleNewWithRuntime(runtimeId?: string): void {
    ui.activeMode.value = 'agent'
    ui.collaborationWorkspace.value = false
    conversation.startNewConversation(runtimeId)
  }

  function handleNew(): void {
    handleNewWithRuntime()
  }

  function handleQuickCreate(workingDirectory: string | null): void {
    handleNew()
    conversation.setWorkingDirectory(workingDirectory)
  }

  async function selectNewConversationProject(): Promise<void> {
    if (!workspaceClient) return
    try {
      const directory = await workspaceClient.selectDirectory()
      if (directory) conversation.setWorkingDirectory(directory)
    } catch {
      // A cancelled or unavailable native picker leaves the draft unchanged.
    }
  }

  function selectRole(roleId: string | null): void {
    ui.selectedRoleId.value = roleId
    if (conversation.conversationId) conversation.startNewConversation()
  }

  function applyActiveRolePrompt(prompt: string): void {
    if (ui.collaborationWorkspace.value && collaboration.activeBinding) {
      const draft = agentDrawer.ensureState(collaboration.activeBinding).draft
      agentDrawer.updateDraft(collaboration.activeBinding, {
        text: appendPrompt(draft.text, prompt),
      })
      return
    }
    ui.localComposerText.value = appendPrompt(ui.localComposerText.value, prompt)
  }

  function applyCollaborationRolePrompt(prompt: string): void {
    const binding = collaboration.activeBinding
    if (!binding) return
    const draft = agentDrawer.ensureState(binding).draft
    agentDrawer.updateDraft(binding, { text: appendPrompt(draft.text, prompt) })
  }

  async function handleSelect(id: string): Promise<void> {
    ui.activeMode.value = 'agent'
    conversation.markConversationSeen(id)
    const summary = conversation.conversations.find((value) => value.conversationId === id)
    const environment = runtime.channelEnvironment.value
    if (summary?.channelBinding && environment) {
      const status = environment.transport.status()
      if (
        status.accountRef === summary.channelBinding.accountRef &&
        environment.transport.descriptor().id === summary.channelBinding.transportId
      ) {
        // Switch surfaces before restoring the ACP session so the user sees
        // the collaboration loading state while the Agent process starts.
        ui.collaborationWorkspace.value = true
        try {
          await channels.selectChannel(summary.channelBinding.channelRef)
        } catch {
          // Agent history can still open when the Channel message request fails.
        }
        await collaboration.bindChannel(summary.channelBinding.channelRef)
        await collaboration.selectConversation(id)
        conversation.markConversationSeen(id)
        return
      }
    }
    ui.collaborationWorkspace.value = false
    await conversation.selectConversation(id)
    conversation.markConversationSeen(id)
  }

  async function archiveConversation(id: string): Promise<void> {
    const isCollaborationConversation = collaboration.conversations.some(
      (value) => value.conversationId === id,
    )
    await conversation.archiveConversation(id)
    if (
      isCollaborationConversation &&
      !conversation.conversations.some((value) => value.conversationId === id)
    ) {
      collaboration.removeConversationFromIndex(id)
    }
  }

  function selectWorkspace(mode: WorkspaceMode): void {
    if (mode === 'directory') {
      ui.activeMode.value = mode
      ui.directoryActionError.value = null
      void stores.directory.refresh()
      return
    }
    if (mode === 'profile') {
      if (ui.activeMode.value === 'channels' || ui.activeMode.value === 'agent')
        ui.previousMode.value = ui.activeMode.value
      ui.activeMode.value = mode
      void stores.profile.refresh()
      return
    }
    if (mode === 'settings' || mode === 'management') {
      if (ui.activeMode.value === 'channels' || ui.activeMode.value === 'agent')
        ui.previousMode.value = ui.activeMode.value
      ui.activeMode.value = mode
      return
    }
    ui.activeMode.value = mode
    ui.previousMode.value = mode
  }

  async function messageDirectoryUser(user: DirectoryUser): Promise<void> {
    if (!user.im?.account) return
    try {
      ui.directoryActionError.value = null
      await channels.openDirectConversation(user.im.account)
      ui.activeMode.value = 'channels'
    } catch {
      ui.directoryActionError.value = 'directory.errors.messageFailed'
    }
  }

  async function forwardToAgent(payload: {
    message: Parameters<typeof collaboration.stageMessage>[0]
    action: 'current' | 'conversation' | 'runtime' | 'all'
    id?: string
  }): Promise<void> {
    if (payload.action === 'conversation' && payload.id) {
      await collaboration.selectConversation(payload.id)
      collaboration.stageMessage(payload.message, { openChooser: false })
    } else if (payload.action === 'runtime' && payload.id) {
      await collaboration.createConversationForMessage(payload.id, payload.message)
    } else if (payload.action === 'all') {
      collaboration.stageMessage(payload.message)
    } else {
      collaboration.stageMessage(payload.message, { openChooser: false })
    }
    if (!settings.agentDrawerOpen) await settings.openAgentDrawer()
  }

  async function createCollaborationConversation(runtimeId?: string): Promise<void> {
    const conversationId = await collaboration.createConversation(runtimeId)
    if (conversationId) collaboration.closeChooser()
  }

  async function selectCollaborationConversation(conversationId: string): Promise<void> {
    if (await collaboration.selectConversation(conversationId)) collaboration.closeChooser()
  }

  function expandCollaboration(): void {
    if (!collaboration.conversationId) return
    ui.collaborationWorkspace.value = true
    ui.activeMode.value = 'agent'
  }

  function selectCollaborationModel(value: string): void {
    collaboration.selectModel(value)
    void settings.setDefaultModel(value)
    if (collaboration.activeBinding)
      agentDrawer.updateDraft(collaboration.activeBinding, { model: value })
  }

  function selectCollaborationPermission(value: PermissionMode): void {
    collaboration.permissionMode = value
    if (collaboration.activeBinding)
      agentDrawer.updateDraft(collaboration.activeBinding, { permissionMode: value })
  }

  function selectCollaborationRole(roleId: string | null): void {
    selectRole(roleId)
    if (collaboration.activeBinding)
      agentDrawer.updateDraft(collaboration.activeBinding, { roleId })
  }

  function selectConversationModel(value: string): void {
    conversation.selectModel(value)
    void settings.setDefaultModel(value)
  }

  function selectConversationPermission(value: PermissionMode): void {
    conversation.permissionMode = value
  }

  function selectActiveRuntime(runtimeId: string): void {
    if (ui.collaborationWorkspace.value) collaboration.selectRuntime(runtimeId)
    else conversation.selectRuntime(runtimeId)
  }

  function selectActiveModel(model: string): void {
    if (ui.collaborationWorkspace.value) selectCollaborationModel(model)
    else selectConversationModel(model)
  }

  function selectActivePermission(permissionMode: PermissionMode): void {
    if (ui.collaborationWorkspace.value) selectCollaborationPermission(permissionMode)
    else selectConversationPermission(permissionMode)
  }

  async function stopActiveConversation(): Promise<void> {
    if (ui.collaborationWorkspace.value) await collaboration.cancel()
    else await conversation.cancelConversation()
  }

  async function retryActiveConversation(): Promise<void> {
    if (conversation.conversationId)
      await conversation.selectConversation(conversation.conversationId)
  }

  async function resolveActiveApproval(payload: {
    approvalId: string
    decision: ApprovalDecision
  }): Promise<void> {
    if (ui.collaborationWorkspace.value)
      await collaboration.respondToApproval(payload.approvalId, payload.decision)
    else await conversation.respondToApproval(payload.approvalId, payload.decision)
  }

  async function logout(): Promise<void> {
    if (ui.logoutPending.value) return
    ui.logoutPending.value = true
    try {
      await logoutWorkspace(runtime.workspaceLifecycle, () => centerAuth.logout())
    } finally {
      ui.logoutPending.value = false
    }
  }

  async function handleSend(payload: {
    text: string
    attachments: ComposerAttachment[]
  }): Promise<void> {
    void settings.setDefaultModel(conversation.selectedModel)
    const accepted = await conversation.sendMessage(payload.text, payload.attachments)
    if (accepted) {
      ui.localComposerText.value = ''
      ui.localComposerAttachments.value = []
    }
  }

  async function sendFromFullSurface(payload: {
    text: string
    attachments: ComposerAttachment[]
  }): Promise<void> {
    if (ui.collaborationWorkspace.value) {
      void settings.setDefaultModel(collaboration.selectedModel)
      await collaboration.sendMessage(payload.text)
    } else await handleSend(payload)
  }

  async function sendCollaborationMessage(text: string): Promise<void> {
    void settings.setDefaultModel(collaboration.selectedModel)
    await collaboration.sendMessage(text)
  }

  async function openDraftEditor(payload: {
    turnIndex: number
    blockId: string
    content: string
  }): Promise<void> {
    const draft = await collaboration.createDraft(
      payload.turnIndex,
      payload.blockId,
      payload.content,
    )
    if (draft) ui.draftDialogId.value = draft.draftId
  }

  async function saveDialogDraft(content: string): Promise<void> {
    if (ui.draftDialogId.value) await collaboration.updateDraft(ui.draftDialogId.value, content)
  }

  async function deliverDialogDraft(): Promise<void> {
    if (ui.draftDialogId.value) await collaboration.deliverDraft(ui.draftDialogId.value)
  }

  return {
    handleNew,
    handleNewWithRuntime,
    handleQuickCreate,
    selectNewConversationProject,
    handleSelect,
    archiveConversation,
    selectRole,
    applyActiveRolePrompt,
    applyCollaborationRolePrompt,
    selectWorkspace,
    messageDirectoryUser,
    forwardToAgent,
    createCollaborationConversation,
    selectCollaborationConversation,
    expandCollaboration,
    selectCollaborationModel,
    selectCollaborationPermission,
    selectCollaborationRole,
    selectActiveRuntime,
    selectActiveModel,
    selectActivePermission,
    stopActiveConversation,
    retryActiveConversation,
    resolveActiveApproval,
    logout,
    sendFromFullSurface,
    sendCollaborationMessage,
    openDraftEditor,
    saveDialogDraft,
    deliverDialogDraft,
  }
}

function appendPrompt(existing: string, prompt: string): string {
  const next = prompt.trim()
  if (!next) return existing
  const current = existing.trim()
  return current ? `${current}\n\n${next}` : next
}
