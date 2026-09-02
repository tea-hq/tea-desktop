// @vitest-environment happy-dom

import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import type { TeaDesktopStores } from './desktopAppDependencies'
import { useWorkspaceRuntime } from './useWorkspaceRuntime'
import type { CenterAuthState } from '@/features/auth/contracts'
import type { ManagedWorkspacePhase } from '@/features/managed-runtime/contracts'

vi.mock('@/infrastructure/channels/channelComposition', () => ({
  createChannelEnvironment: vi.fn(() => ({
    preview: false,
    transport: {},
    attachmentPicker: {},
    draftClient: {},
    voicePlaybackClient: {},
    mediaClient: {},
  })),
}))

describe('useWorkspaceRuntime', () => {
  it('recovers managed IM and clears session search state when the workspace exits', async () => {
    const order: string[] = []
    const connectChannel = vi.fn(async () => {
      order.push('im-connect')
    })
    const managedRuntime = reactive({
      imReady: false,
      pending: false,
      state: { phase: 'inactive' as ManagedWorkspacePhase, generation: 0 },
      configure: vi.fn(),
      initialize: vi.fn(async () => undefined),
      refresh: vi.fn(async () => {
        order.push('managed-refresh')
        managedRuntime.imReady = true
        managedRuntime.state.phase = 'ready'
        managedRuntime.state.generation = 1
      }),
      dispose: vi.fn(),
    })
    const centerAuth = reactive({
      canEnterWorkspace: false,
      pending: false,
      state: {
        generation: 0,
        phase: 'signedOut',
        enterprise: null,
        bootstrap: null,
        lastValidatedAt: null,
        errorCode: null,
      } as CenterAuthState,
      configure: vi.fn(),
      initialize: vi.fn(async () => undefined),
      dispose: vi.fn(),
    })
    const channels = reactive({
      channels: [],
      activeChannelRef: null,
      activeChannel: null,
      status: { phase: 'disconnected', retryable: false },
      loadingChannels: false,
      loadingMessages: false,
      configure: vi.fn(),
      connect: connectChannel,
      disconnect: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    })
    const stores = createStores(centerAuth, managedRuntime, channels)
    let activeSession: {
      initialize: (isCurrent: () => boolean) => Promise<void>
      dispose: () => Promise<void>
    } | null = null
    const workspaceLifecycle = {
      enter: vi.fn(
        async (
          _key: string,
          create: () => {
            initialize: (isCurrent: () => boolean) => Promise<void>
            dispose: () => Promise<void>
          },
        ) => {
          order.push('workspace-enter')
          activeSession = create()
          await activeSession.initialize(() => true)
          order.push('workspace-ready')
        },
      ),
      exit: vi.fn(async () => {
        await activeSession?.dispose()
        activeSession = null
      }),
    }
    const globalSearchQuery = ref('')
    const Host = defineComponent(() => {
      useWorkspaceRuntime(
        stores,
        {
          activeMode: ref('channels'),
          previousMode: ref('channels'),
          collaborationWorkspace: ref(false),
          selectedRoleId: ref<string | null>(null),
          globalSearchQuery,
        } as never,
        {
          listRuntimes: vi.fn(async () => ({ runtimes: [] })),
        } as never,
        workspaceLifecycle as never,
      )
      return () => h('div')
    })

    const wrapper = mount(Host)
    centerAuth.canEnterWorkspace = true
    centerAuth.state = {
      generation: 1,
      phase: 'authenticated',
      enterprise: null,
      bootstrap: {
        schemaVersion: 1,
        revision: 1,
        generatedAt: '2026-08-30T00:00:00.000Z',
        tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example' },
        user: {
          id: 'user-1',
          displayName: 'Example User',
          preferredUsername: 'example.user',
          email: 'user@example.test',
          emailVerified: true,
          avatarUrl: '',
          oidcSubject: 'subject-1',
        },
        im: null,
        modelProviders: [],
      },
      lastValidatedAt: 1_787_843_600_000,
      errorCode: null,
    }

    await nextTick()
    await flushPromises()
    expect(workspaceLifecycle.enter).toHaveBeenCalledOnce()
    expect(managedRuntime.refresh).toHaveBeenCalledOnce()
    expect(connectChannel).toHaveBeenCalledOnce()
    expect(channels.configure).toHaveBeenCalledWith({}, {}, {}, {}, {})
    expect(order).toEqual(['workspace-enter', 'workspace-ready', 'managed-refresh', 'im-connect'])

    centerAuth.state = { ...centerAuth.state, errorCode: 'centerUnavailable' }
    await flushPromises()
    expect(managedRuntime.refresh).toHaveBeenCalledOnce()

    globalSearchQuery.value = 'engineering'
    centerAuth.canEnterWorkspace = false
    centerAuth.state = {
      generation: 2,
      phase: 'signedOut',
      enterprise: null,
      bootstrap: null,
      lastValidatedAt: null,
      errorCode: null,
    }
    await nextTick()
    await flushPromises()
    expect(workspaceLifecycle.exit).toHaveBeenCalled()
    expect(globalSearchQuery.value).toBe('')

    wrapper.unmount()
  })
})

function createStores(
  centerAuth: Record<string, unknown>,
  managedRuntime: Record<string, unknown>,
  channels: Record<string, unknown>,
): TeaDesktopStores {
  const runtimeStore = {
    runtimes: [],
    setDefaultRuntimeId: vi.fn(),
    loadRuntimes: vi.fn(async () => undefined),
    configure: vi.fn(),
    dispose: vi.fn(),
    bindChannel: vi.fn(async () => undefined),
  }
  const conversation = {
    ...runtimeStore,
    initializeConversationList: vi.fn(async () => undefined),
    setDefaultRuntimeId: vi.fn(),
    setDefaultModel: vi.fn(),
  }
  const collaboration = {
    ...runtimeStore,
    selectedRuntimeId: null,
    setDefaultModel: vi.fn(),
  }
  return {
    centerAuth: centerAuth as never,
    managedRuntime: managedRuntime as never,
    channels: channels as never,
    conversation: conversation as never,
    collaboration: collaboration as never,
    agentDrawer: {} as never,
    settings: {
      defaultRuntimeId: 'external.test',
      defaultModel: null,
      configure: vi.fn(),
      initialize: vi.fn(async () => undefined),
    } as never,
    agentRoles: { initialize: vi.fn(async () => undefined) } as never,
    managedConfig: { apply: vi.fn(), clear: vi.fn() } as never,
    profile: {
      configure: vi.fn(),
      setCenterProfile: vi.fn(),
      refresh: vi.fn(async () => undefined),
      dispose: vi.fn(),
    } as never,
    directory: { configure: vi.fn() } as never,
    userProfiles: {
      configure: vi.fn(),
      ensureProfiles: vi.fn(async () => undefined),
      clear: vi.fn(),
    } as never,
  }
}
