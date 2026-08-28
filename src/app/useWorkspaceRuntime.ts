import { onMounted, onUnmounted, shallowRef, watch, type ShallowRef } from 'vue'
import type { CenterSelfProfile } from '@/features/profile/contracts'
import { copyCenterSelfProfile } from '@/features/profile/contracts'
import { createChannelEnvironment, type ChannelEnvironment } from '@/infrastructure/channels/channelComposition'
import { ElectronCenterAuthClient } from '@/infrastructure/auth/electronCenterAuthClient'
import { ElectronDirectoryClient } from '@/infrastructure/directory/electronDirectoryClient'
import { ElectronManagedWorkspaceClient } from '@/infrastructure/managed-runtime/electronManagedWorkspaceClient'
import { ElectronSettingsClient } from '@/infrastructure/settings/electronSettingsClient'
import { WorkspaceLifecycle, type WorkspaceSession } from './workspaceLifecycle'
import { recoverManagedWorkspace } from './refreshManagedWorkspace'
import type { ConversationClient } from '@/features/conversation/contracts'
import type { TeaDesktopStores } from './desktopAppDependencies'
import type { WorkspaceUiState } from './desktopAppState'

export interface WorkspaceRuntime {
  channelEnvironment: ShallowRef<ChannelEnvironment | null>
  workspaceLifecycle: WorkspaceLifecycle
  connectChannel: () => Promise<void>
  disconnectChannel: () => Promise<void>
  refreshManagedWorkspace: () => Promise<void>
}

export function useWorkspaceRuntime(
  stores: TeaDesktopStores,
  ui: WorkspaceUiState,
  conversationClient: ConversationClient,
  workspaceLifecycle: WorkspaceLifecycle,
): WorkspaceRuntime {
  const { conversation, channels, collaboration, settings, agentRoles, centerAuth, managedConfig, managedRuntime, profile, directory } = stores
  const channelEnvironment = shallowRef<ChannelEnvironment | null>(null)
  let channelConnectPending = false

  onMounted(async () => {
    centerAuth.configure(new ElectronCenterAuthClient())
    managedRuntime.configure(new ElectronManagedWorkspaceClient())
    await managedRuntime.initialize()
    await centerAuth.initialize()
    await managedRuntime.initialize()
  })

  watch(() => centerAuth.state, value => {
    if (!centerAuth.canEnterWorkspace || !value.bootstrap) {
      profile.setCenterProfile(null)
      managedConfig.clear()
      void workspaceLifecycle.exit().catch(() => undefined)
      return
    }
    profile.setCenterProfile(value.bootstrap.user)
    directory.configure(new ElectronDirectoryClient())
    managedConfig.apply(value.bootstrap)
    const workspaceKey = `${value.bootstrap.tenant.id}:${value.bootstrap.user.id}`
    const workspaceProfile = copyCenterSelfProfile(value.bootstrap.user)
    void workspaceLifecycle.enter(workspaceKey, () => createWorkspaceSession(workspaceProfile)).catch(() => undefined)
  }, { deep: true, immediate: true })

  watch(() => settings.defaultRuntimeId, runtimeId => {
    conversation.setDefaultRuntimeId(runtimeId)
    collaboration.setDefaultRuntimeId(runtimeId)
    if (collaboration.runtimes.some(runtime => runtime.id === runtimeId)) collaboration.selectedRuntimeId = runtimeId
  }, { immediate: true })

  watch(
    () => [managedRuntime.imReady, managedRuntime.state.generation] as const,
    ([ready]) => {
      void Promise.all([conversation.loadRuntimes(), collaboration.loadRuntimes()]).catch(() => undefined)
      const environment = channelEnvironment.value
      if (ready && environment && !environment.preview) void connectChannel().catch(() => undefined)
    },
  )

  watch(
    () => [channels.activeChannelRef, channels.status.phase, channels.status.accountRef] as const,
    ([channelRef]) => { void collaboration.bindChannel(channelRef ?? '') },
  )

  function createWorkspaceSession(workspaceProfile: CenterSelfProfile): WorkspaceSession {
    const environment = createChannelEnvironment()
    let disposed = false
    return {
      async initialize(isCurrent) {
        if (!isCurrent()) return
        channelEnvironment.value = environment
        profile.configure(environment.transport)
        profile.setCenterProfile(workspaceProfile)
        channels.configure(environment.transport)
        collaboration.configure(conversationClient, environment.transport)
        conversation.configure(conversationClient)
        settings.configure(new ElectronSettingsClient())
        const bootstrap = centerAuth.state.bootstrap
        void agentRoles.initialize(bootstrap ? { tenantId: bootstrap.tenant.id, subjectId: bootstrap.user.id } : undefined)
        await initializeApp(environment, isCurrent)
      },
      async dispose() {
        if (disposed) return
        disposed = true
        if (channelEnvironment.value === environment) channelEnvironment.value = null
        ui.activeMode.value = 'channels'
        ui.previousMode.value = 'channels'
        ui.collaborationWorkspace.value = false
        ui.selectedRoleId.value = null
        profile.dispose()
        managedConfig.clear()
        const conversationDisposal = conversation.dispose()
        collaboration.dispose()
        const channelDisposal = channels.dispose()
        await Promise.allSettled([conversationDisposal, channelDisposal])
      },
    }
  }

  async function initializeApp(environment: ChannelEnvironment, isCurrent: () => boolean): Promise<void> {
    await settings.initialize()
    if (!isCurrent()) return
    conversation.setDefaultRuntimeId(settings.defaultRuntimeId)
    collaboration.setDefaultRuntimeId(settings.defaultRuntimeId)
    await Promise.all([
      conversation.loadRuntimes(),
      conversation.initializeConversationList(),
      collaboration.loadRuntimes(),
      initializeChannels(environment),
    ])
    if (!isCurrent()) return
    if (collaboration.runtimes.some(runtime => runtime.id === settings.defaultRuntimeId)) collaboration.selectedRuntimeId = settings.defaultRuntimeId
  }

  async function initializeChannels(environment: ChannelEnvironment): Promise<void> {
    if (environment.preview) {
      await channels.connect()
      return
    }
    if (managedRuntime.imReady) await channels.connect().catch(() => undefined)
  }

  onUnmounted(() => {
    centerAuth.dispose()
    managedRuntime.dispose()
    void workspaceLifecycle.exit().catch(() => undefined)
  })

  async function connectChannel(): Promise<void> {
    if (channelConnectPending) return
    const environment = channelEnvironment.value
    if (!environment || environment.preview || !managedRuntime.imReady) return
    channelConnectPending = true
    try {
      await channels.connect()
    } finally {
      channelConnectPending = false
    }
  }

  async function disconnectChannel(): Promise<void> {
    await channels.disconnect()
    await collaboration.bindChannel('')
  }

  async function refreshManagedWorkspace(): Promise<void> {
    await recoverManagedWorkspace(centerAuth, managedRuntime, connectChannel)
  }

  return { channelEnvironment, workspaceLifecycle, connectChannel, disconnectChannel, refreshManagedWorkspace }
}
