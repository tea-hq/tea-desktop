<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import ConversationSidebar from '@/features/conversation/components/ConversationSidebar.vue'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import { fullAgentProfile } from '@/app/composerProfiles'

const {
  channels,
  conversation,
  collaboration,
  settings,
  roleOptions,
  collaborationWorkspace,
  selectedRoleId,
  fullComposerText,
  fullComposerAttachments,
  collaborationModelOptions,
  errorText,
  sendFromFullSurface,
  applyActiveRolePrompt,
  handleNew,
  handleSelect,
  openDraftEditor,
  selectRole,
  selectActiveRuntime,
  selectActiveModel,
  selectActivePermission,
  stopActiveConversation,
  retryActiveConversation,
  resolveActiveApproval,
} = useTeaDesktopAppContext()
const { t } = useI18n()
</script>

<template>
  <ConversationSidebar
    v-if="settings.leftSidebarOpen"
    :conversations="conversation.conversations"
    :active-id="collaborationWorkspace ? collaboration.conversationId : conversation.conversationId"
    :runtimes="conversation.runtimes"
    :loading="conversation.listLoading"
    :loading-more="conversation.listLoadingMore"
    :error="conversation.listError"
    :has-more="conversation.hasMore"
    :filter="conversation.catalogFilter"
    @new="handleNew"
    @select="handleSelect"
    @load-more="conversation.loadMoreConversations()"
    @retry="conversation.initializeConversationList(true)"
    @filter="conversation.setCatalogFilter($event)"
  />

  <main class="min-w-0 flex-1">
    <AgentConversationSurface
      v-model:text="fullComposerText"
      v-model:attachments="fullComposerAttachments"
      :profile="fullAgentProfile"
      :title="
        collaborationWorkspace
          ? collaboration.activeConversation?.title || t('channels.collaboration.newSession')
          : conversation.activeConversation?.title || t('app.newConversationTitle')
      "
      :subtitle="
        collaborationWorkspace && channels.activeChannel ? channels.activeChannel.name : ''
      "
      :runtime-label="
        collaborationWorkspace
          ? collaboration.activeRuntime?.displayName
          : conversation.activeRuntime?.displayName
      "
      :turns="collaborationWorkspace ? collaboration.turns : conversation.turns"
      :turn-contexts="collaborationWorkspace ? collaboration.collaboration.turnContexts : undefined"
      :draft-block-ids="
        collaborationWorkspace
          ? collaboration.collaboration.drafts.map((draft) => draft.sourceBlockId)
          : undefined
      "
      :collaboration="collaborationWorkspace"
      :loading="collaborationWorkspace ? collaboration.loading : conversation.historyLoading"
      :loading-older="!collaborationWorkspace && conversation.historyLoadingMore"
      :has-older="!collaborationWorkspace && conversation.historyHasMore"
      :error="errorText"
      :sources="collaborationWorkspace ? collaboration.stagedSources : []"
      :runtimes="collaborationWorkspace ? collaboration.runtimes : conversation.runtimes"
      :runtime-id="
        collaborationWorkspace ? collaboration.selectedRuntimeId : conversation.activeRuntimeId
      "
      :model-options="
        collaborationWorkspace ? collaborationModelOptions : conversation.modelOptions
      "
      :model="collaborationWorkspace ? collaboration.selectedModel : conversation.selectedModel"
      :permission-mode="
        collaborationWorkspace ? collaboration.permissionMode : conversation.permissionMode
      "
      :roles="roleOptions"
      :role-id="selectedRoleId"
      :disabled="
        collaborationWorkspace
          ? !collaboration.canSend
          : conversation.loading || !conversation.activeRuntimeId
      "
      :streaming="collaborationWorkspace ? collaboration.isStreaming : conversation.isStreaming"
      @send="sendFromFullSurface"
      @stop="stopActiveConversation"
      @load-older="conversation.loadOlderHistory()"
      @retry="retryActiveConversation"
      @remove-source="collaboration.removeStagedSource($event)"
      @select-runtime="selectActiveRuntime"
      @select-model="selectActiveModel"
      @select-permission="selectActivePermission"
      @select-role="selectRole"
      @apply-role-prompt="applyActiveRolePrompt"
      @resolve-approval="resolveActiveApproval"
      @create-draft="openDraftEditor"
    />
  </main>
</template>
