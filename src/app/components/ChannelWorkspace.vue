<script setup lang="ts">
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import ChannelConnectionPanel from '@/features/channels/components/ChannelConnectionPanel.vue'
import ChannelSelectionPlaceholder from '@/features/channels/components/ChannelSelectionPlaceholder.vue'
import ChannelSidebar from '@/features/channels/components/ChannelSidebar.vue'
import ChannelTimeline from '@/features/channels/components/ChannelTimeline.vue'
import AgentDrawer from '@/features/collaboration/components/AgentDrawer.vue'
import type { ChannelRef } from '@/features/channels/contracts'

const {
  centerAuth,
  channels,
  collaboration,
  agentDrawer,
  settings,
  managedRuntime,
  activeAgentDrawerState,
  roleOptions,
  collaborationModelOptions,
  recentCollaborationConversations,
  currentChannelSessionAvailable,
  collaborationErrorText,
  selectCollaborationConversation,
  createCollaborationConversation,
  expandCollaboration,
  forwardToAgent,
  refreshManagedWorkspace,
  openDraftEditor,
  selectCollaborationModel,
  selectCollaborationPermission,
  selectCollaborationRole,
  applyCollaborationRolePrompt,
  sendCollaborationMessage,
} = useTeaDesktopAppContext()

function handleChannelSelect(channelRef: ChannelRef): void {
  void channels.selectChannel(channelRef).catch(() => undefined)
}

function handleChannelSend(text: string): void {
  void channels.sendText(text).catch(() => undefined)
}

function handleLoadMoreChannels(): void {
  void channels.loadOlderMessages().catch(() => undefined)
}
</script>

<template>
  <ChannelSidebar
    :channels="channels.channels"
    :active-ref="channels.activeChannelRef"
    :status="channels.status"
    :loading="channels.loadingChannels"
    @select="handleChannelSelect"
  />
  <ChannelTimeline
    v-if="channels.activeChannel"
    :channel="channels.activeChannel"
    :messages="channels.activeMessages"
    :panel-open="settings.agentDrawerOpen"
    :loading="channels.loadingMessages"
    :has-more="channels.activeHasMoreMessages"
    :sending="channels.sendingMessage"
    :active-conversation="collaboration.activeConversation"
    :recent-conversations="recentCollaborationConversations"
    :current-session-available="currentChannelSessionAvailable"
    :runtimes="collaboration.runtimes"
    :default-runtime-id="settings.defaultRuntimeId"
    @forward-to-agent="forwardToAgent"
    @send="handleChannelSend"
    @load-more="handleLoadMoreChannels"
    @toggle-panel="settings.toggleAgentDrawer()"
  />
  <ChannelSelectionPlaceholder
    v-else-if="channels.status.phase === 'connected' && channels.channels.length > 0"
  />
  <ChannelConnectionPanel
    v-else
    :status="channels.status"
    :error-code="
      channels.errorCode ||
      managedRuntime.state.im?.errorCode ||
      managedRuntime.state.errorCode ||
      null
    "
    :managed-phase="managedRuntime.state.phase"
    :im-status="managedRuntime.state.im?.status"
    :channels-loading="channels.loadingChannels"
    :pending="centerAuth.pending || managedRuntime.pending"
    @retry="refreshManagedWorkspace"
  />
  <AgentDrawer
    v-if="channels.activeChannel && activeAgentDrawerState"
    :open="settings.agentDrawerOpen"
    :state="activeAgentDrawerState"
    :conversations="collaboration.conversations"
    :runtimes="collaboration.runtimes"
    :default-runtime-id="settings.defaultRuntimeId"
    :turns="collaboration.turns"
    :collaboration="collaboration.collaboration"
    :model-options="collaborationModelOptions"
    :roles="roleOptions"
    :loading="collaboration.loading"
    :sending="collaboration.sending"
    :streaming="collaboration.isStreaming"
    :error="collaborationErrorText"
    @close="settings.closeAgentDrawer()"
    @select="selectCollaborationConversation"
    @create="createCollaborationConversation()"
    @create-with-runtime="createCollaborationConversation($event)"
    @view-all="agentDrawer.setListMode(collaboration.activeBinding!, 'all')"
    @update-query="agentDrawer.setQuery(collaboration.activeBinding!, $event)"
    @update-text="agentDrawer.updateDraft(collaboration.activeBinding!, { text: $event })"
    @update-attachments="
      agentDrawer.updateDraft(collaboration.activeBinding!, { attachments: $event })
    "
    @send="sendCollaborationMessage($event.text)"
    @stop="collaboration.cancel()"
    @back="agentDrawer.back(collaboration.activeBinding!)"
    @expand="expandCollaboration"
    @remove-source="collaboration.removeStagedSource($event)"
    @create-draft="openDraftEditor"
    @resolve-approval="collaboration.respondToApproval($event.approvalId, $event.decision)"
    @select-runtime="collaboration.selectRuntime($event)"
    @select-model="selectCollaborationModel"
    @select-permission="selectCollaborationPermission"
    @select-role="selectCollaborationRole"
    @apply-role-prompt="applyCollaborationRolePrompt"
  />
</template>
