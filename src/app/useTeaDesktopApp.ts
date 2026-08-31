import { useAgentDrawerStore } from '@/features/collaboration/agentDrawerStore'
import { useCollaborationStore } from '@/features/collaboration/store'
import { useConversationStore } from '@/features/conversation/store'
import { useChannelsStore } from '@/features/channels/store'
import { useDirectoryStore } from '@/features/directory/store'
import { useProfileStore } from '@/features/profile/store'
import { useAgentRolesStore } from '@/features/agent-roles/store'
import { useSettingsStore } from '@/features/settings/store'
import { useCenterAuthStore } from '@/features/auth/store'
import { useManagedConfigStore } from '@/features/managed-config/store'
import { useManagedRuntimeStore } from '@/features/managed-runtime/store'
import { getDefaultConversationClient } from '@/infrastructure/conversation/electronConversationClient'
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
  }
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
