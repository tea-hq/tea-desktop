import type { useAgentDrawerStore } from '@/features/collaboration/agentDrawerStore'
import type { useCollaborationStore } from '@/features/collaboration/store'
import type { useConversationStore } from '@/features/conversation/store'
import type { useDirectoryStore } from '@/features/directory/store'
import type { useChannelUserProfileStore } from '@/features/channels/userProfileStore'
import type { useProfileStore } from '@/features/profile/store'
import type { useAgentRolesStore } from '@/features/agent-roles/store'
import type { useSettingsStore } from '@/features/settings/store'
import type { useCenterAuthStore } from '@/features/auth/store'
import type { useManagedConfigStore } from '@/features/managed-config/store'
import type { useManagedRuntimeStore } from '@/features/managed-runtime/store'

export interface TeaDesktopStores {
  conversation: ReturnType<typeof useConversationStore>
  channels: ReturnType<typeof import('@/features/channels/store').useChannelsStore>
  collaboration: ReturnType<typeof useCollaborationStore>
  agentDrawer: ReturnType<typeof useAgentDrawerStore>
  settings: ReturnType<typeof useSettingsStore>
  agentRoles: ReturnType<typeof useAgentRolesStore>
  centerAuth: ReturnType<typeof useCenterAuthStore>
  managedConfig: ReturnType<typeof useManagedConfigStore>
  managedRuntime: ReturnType<typeof useManagedRuntimeStore>
  profile: ReturnType<typeof useProfileStore>
  directory: ReturnType<typeof useDirectoryStore>
  userProfiles: ReturnType<typeof useChannelUserProfileStore>
}
