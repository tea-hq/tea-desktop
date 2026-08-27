<script setup lang="ts">
import ChannelWorkspace from './ChannelWorkspace.vue'
import AgentWorkspace from './AgentWorkspace.vue'
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import ManagementWorkspace from '@/features/management/components/ManagementWorkspace.vue'
import SettingsPage from '@/features/settings/components/SettingsPage.vue'
import ProfilePage from '@/features/profile/components/ProfilePage.vue'
import DirectoryPage from '@/features/directory/components/DirectoryPage.vue'

const {
  activeMode,
  previousMode,
  centerAuth,
  settings,
  conversation,
  profile,
  directory,
  directoryActionError,
  selectWorkspace,
  messageDirectoryUser,
} = useTeaDesktopAppContext()
</script>

<template>
  <ChannelWorkspace v-if="activeMode === 'channels'" />
  <DirectoryPage
    v-else-if="activeMode === 'directory'"
    :users="directory.filteredUsers"
    :phase="directory.phase"
    :error-key="directory.errorKey"
    :query="directory.query"
    :action-error="directoryActionError"
    @update:query="directory.query = $event"
    @retry="directory.refresh()"
    @refresh="directory.refresh()"
    @message="messageDirectoryUser"
  />
  <AgentWorkspace v-else-if="activeMode === 'agent'" />
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
    @retry="profile.refresh()"
    @close="selectWorkspace(previousMode)"
  />
  <ManagementWorkspace v-else-if="activeMode === 'management'" @close="selectWorkspace(previousMode)" />
  <main v-else class="flex min-w-0 flex-1 flex-col tea-bg-canvas">
    <SettingsPage
      :locale-preference="settings.settings.locale"
      :default-runtime-id="settings.defaultRuntimeId"
      :runtimes="conversation.runtimes"
      :saving="settings.saving"
      :error="settings.error"
      @close="selectWorkspace(previousMode)"
      @update-locale="settings.setLocalePreference($event)"
      @update-default-runtime="settings.setDefaultRuntime($event)"
    />
  </main>
</template>
