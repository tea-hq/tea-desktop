<script setup lang="ts">
import ChannelWorkspace from './ChannelWorkspace.vue'
import AgentWorkspace from './AgentWorkspace.vue'
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import ManagementWorkspace from '@/features/management/components/ManagementWorkspace.vue'
import SettingsPage from '@/features/settings/components/SettingsPage.vue'
import ProfilePage from '@/features/profile/components/ProfilePage.vue'
import DirectoryPage from '@/features/directory/components/DirectoryPage.vue'
import TaskWorkspace from '@/features/tasks/components/TaskWorkspace.vue'

defineProps<{ globalSearchQuery: string }>()

const {
  activeMode,
  previousMode,
  centerAuth,
  settings,
  conversation,
  conversationModelOptions,
  profile,
  userProfiles,
  directory,
  directoryActionError,
  selectWorkspace,
  messageDirectoryUser,
} = useTeaDesktopAppContext()
</script>

<template>
  <ChannelWorkspace v-if="activeMode === 'channels'" :search-query="globalSearchQuery" />
  <DirectoryPage
    v-else-if="activeMode === 'directory'"
    :users="directory.filteredUsers"
    :total-count="directory.users.length"
    :tenant-name="
      directory.users[0]?.tenant.displayName ?? centerAuth.state.bootstrap?.tenant.displayName ?? ''
    "
    :phase="directory.phase"
    :error-key="directory.errorKey"
    :query="directory.query"
    :action-error="directoryActionError"
    :user-profiles="userProfiles.profiles"
    @update:query="directory.query = $event"
    @retry="directory.refresh()"
    @refresh="directory.refresh()"
    @message="messageDirectoryUser"
  />
  <AgentWorkspace v-else-if="activeMode === 'agent'" :search-query="globalSearchQuery" />
  <TaskWorkspace v-else-if="activeMode === 'tasks'" :search-query="globalSearchQuery" />
  <ProfilePage
    v-else-if="activeMode === 'profile' && centerAuth.state.bootstrap"
    :tenant-display-name="centerAuth.state.bootstrap.tenant.displayName"
    :tenant-domain="centerAuth.state.bootstrap.tenant.domain"
    :center-profile="centerAuth.state.bootstrap.user"
    :channel-profile="profile.channelProfile"
    :provider-name="profile.providerName"
    :phase="profile.phase"
    :alignment="profile.alignment"
    :comparisons="profile.comparisons"
    :error-key="profile.errorKey"
    :offline="centerAuth.state.phase === 'offlineCached'"
    :runner-tokens="conversation.cloudRunnerTokens"
    :runner-registration-token-id="conversation.cloudRunnerRegistrationTokenId"
    :runner-registration-command="conversation.cloudRunnerRegistrationCommand"
    :runner-tokens-loading="conversation.cloudRunnerTokensLoading"
    :runner-tokens-error="conversation.cloudRunnerTokensError"
    :runner-registration-command-loading="conversation.cloudRunnerRegistrationCommandLoading"
    :runner-registration-command-error="conversation.cloudRunnerRegistrationCommandError"
    @retry="profile.refresh()"
    @refresh-runner-tokens="conversation.loadRunnerTokens()"
    @select-runner-token="conversation.selectRunnerRegistrationToken($event)"
    @reset-personal-runner-token="conversation.resetPersonalRunnerToken()"
    @close="selectWorkspace(previousMode)"
  />
  <ManagementWorkspace
    v-else-if="activeMode === 'management'"
    @close="selectWorkspace(previousMode)"
  />
  <main v-else class="flex min-w-0 flex-1 flex-col bg-canvas">
    <SettingsPage
      :locale-preference="settings.settings.locale"
      :theme-preference="settings.settings.theme"
      :default-runtime-id="settings.defaultRuntimeId"
      :default-model="settings.defaultModel"
      :model-options="conversationModelOptions"
      :runtimes="conversation.runtimes"
      :saving="settings.saving"
      :error="settings.error"
      @close="selectWorkspace(previousMode)"
      @update-locale="settings.setLocalePreference($event)"
      @update-theme="settings.setThemePreference($event)"
      @update-default-runtime="settings.setDefaultRuntime($event)"
      @update-default-model="settings.setDefaultModel($event)"
    />
  </main>
</template>
