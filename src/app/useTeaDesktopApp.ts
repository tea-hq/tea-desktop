import { onUnmounted, watch } from 'vue'

import { useAgentDrawerStore } from '@/features/collaboration/agentDrawerStore'
import { useCollaborationStore } from '@/features/collaboration/store'
import { useConversationStore } from '@/features/conversation/store'
import { useChannelsStore } from '@/features/channels/store'
import { useDirectoryStore } from '@/features/directory/store'
import { useChannelUserProfileStore } from '@/features/channels/userProfileStore'
import { useProfileStore } from '@/features/profile/store'
import { useAgentRolesStore } from '@/features/agent-roles/store'
import { useSettingsStore } from '@/features/settings/store'
import { useCenterAuthStore } from '@/features/auth/store'
import { useManagedConfigStore } from '@/features/managed-config/store'
import { useManagedRuntimeStore } from '@/features/managed-runtime/store'
import { getDefaultConversationClient } from '@/infrastructure/conversation/electronConversationClient'
import { hasElectronBridge, setWindowTheme } from '@/infrastructure/electronBridge'
import { ElectronSettingsClient } from '@/infrastructure/settings/electronSettingsClient'
import { createThemeController } from '@/shared/ui/theme/themeController'
import { ElectronWorkspaceClient } from '@/infrastructure/workspace/electronWorkspaceClient'
import { WorkspaceLifecycle } from './workspaceLifecycle'
import type { TeaDesktopStores } from './desktopAppDependencies'
import { createWorkspaceUiState } from './desktopAppState'
import { useWorkspaceActions } from './useWorkspaceActions'
import { useWorkspaceRuntime } from './useWorkspaceRuntime'
import { useWorkspaceViewModel } from './useWorkspaceViewModel'

export function useTeaDesktopApp() {
  const stores: TeaDesktopStores = {
    conversation: useConversationStore(),
    channels: useChannelsStore(),
    collaboration: useCollaborationStore(),
    agentDrawer: useAgentDrawerStore(),
    settings: useSettingsStore(),
    agentRoles: useAgentRolesStore(),
    centerAuth: useCenterAuthStore(),
    managedConfig: useManagedConfigStore(),
    managedRuntime: useManagedRuntimeStore(),
    profile: useProfileStore(),
    directory: useDirectoryStore(),
    userProfiles: useChannelUserProfileStore(),
  }
  const settings = stores.settings
  settings.configure(new ElectronSettingsClient())
  const themeController = createThemeController((theme) => {
    if (!hasElectronBridge()) return
    try {
      setWindowTheme(theme)
    } catch {
      // Native chrome is a best-effort projection during renderer shutdown.
    }
  })
  watch(
    () => settings.settings.theme,
    (preference) => themeController.apply(preference),
    { immediate: true },
  )
  void settings.initialize()
  onUnmounted(() => themeController.dispose())
  const ui = createWorkspaceUiState()
  const conversationClient = getDefaultConversationClient()
  const workspaceClient = new ElectronWorkspaceClient()
  const workspaceLifecycle = new WorkspaceLifecycle()
  const runtime = useWorkspaceRuntime(stores, ui, conversationClient, workspaceLifecycle)
  const viewModel = useWorkspaceViewModel(stores, ui)
  const actions = useWorkspaceActions(stores, ui, runtime, workspaceClient)

  return {
    ...stores,
    ...ui,
    ...runtime,
    ...viewModel,
    ...actions,
  }
}
