import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import { createWorkspaceUiState } from './desktopAppState'
import type { TeaDesktopStores } from './desktopAppDependencies'
import { useWorkspaceViewModel } from './useWorkspaceViewModel'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const codexRuntime: RuntimeDescriptor = {
  id: 'external.codex',
  kind: 'externalCli',
  displayName: 'Codex',
  capabilities: ['prompt'],
  status: 'ready',
}

describe('useWorkspaceViewModel', () => {
  it('merges managed provider models for every workspace and preserves provider-qualified values', () => {
    const setConversationModels = vi.fn()
    const setCollaborationModels = vi.fn()
    const managedModels = [
      { value: 'tokbox/gpt-5.6-luna', label: 'Tokbox / GPT-5.6-luna' },
      { value: 'backup/gpt-5.6-luna', label: 'Backup / GPT-5.6-luna' },
    ]
    const stores = {
      conversation: {
        activeRuntime: codexRuntime,
        modelOptions: [{ value: 'default', labelKey: 'composer.model.configured' }],
        setAvailableModelOptions: setConversationModels,
        error: null,
      },
      collaboration: {
        activeRuntime: codexRuntime,
        activeBinding: null,
        activeConversation: null,
        collaboration: { drafts: [], deliveries: [], turnContexts: [] },
        error: null,
        setAvailableModelOptions: setCollaborationModels,
      },
      channels: { activeChannel: null },
      agentDrawer: { ensureState: vi.fn() },
      agentRoles: { roles: [] },
      managedRuntime: { modelOptions: managedModels },
    } as unknown as TeaDesktopStores

    const scope = effectScope()
    scope.run(() => useWorkspaceViewModel(stores, createWorkspaceUiState()))

    expect(setConversationModels).toHaveBeenCalledWith(managedModels)
    expect(setCollaborationModels).toHaveBeenCalledWith(managedModels)
    scope.stop()
  })

  it('offers workspace recovery for a collaboration conversation', () => {
    const stores = {
      conversation: {
        activeRuntime: codexRuntime,
        modelOptions: [],
        conversations: [],
        error: null,
        historyError: null,
        setAvailableModelOptions: vi.fn(),
      },
      collaboration: {
        activeRuntime: codexRuntime,
        activeBinding: null,
        activeConversation: null,
        conversations: [],
        collaboration: { drafts: [], deliveries: [], turnContexts: [] },
        error: {
          kind: 'runtime',
          code: 'workspaceUnavailable',
          message: 'conversation workspace directory is unavailable',
          retryable: false,
        },
        setAvailableModelOptions: vi.fn(),
      },
      channels: { activeChannel: null },
      agentDrawer: { ensureState: vi.fn() },
      agentRoles: { roles: [] },
      managedRuntime: { modelOptions: [] },
    } as unknown as TeaDesktopStores
    const ui = createWorkspaceUiState()
    ui.collaborationWorkspace.value = true
    const scope = effectScope()
    const viewModel = scope.run(() => useWorkspaceViewModel(stores, ui))!

    expect(viewModel.errorText.value).toBe('messages.workspaceUnavailable')
    expect(viewModel.errorRetryable.value).toBe(false)
    expect(viewModel.workspaceRecoveryAvailable.value).toBe(true)
    scope.stop()
  })

  it('preloads profiles for direct conversation participants', () => {
    const ensureProfiles = vi.fn(async () => undefined)
    const stores = {
      conversation: {
        activeRuntime: codexRuntime,
        modelOptions: [],
        conversations: [],
        error: null,
        historyError: null,
        setAvailableModelOptions: vi.fn(),
      },
      collaboration: {
        activeRuntime: codexRuntime,
        activeBinding: null,
        activeConversation: null,
        conversations: [],
        collaboration: { drafts: [], deliveries: [], turnContexts: [] },
        error: null,
        setAvailableModelOptions: vi.fn(),
      },
      channels: {
        activeChannel: null,
        channels: [
          {
            ref: 'p2p|app|account-b',
            kind: 'direct',
            directAccountId: 'account-b',
            name: 'Account B',
            description: '',
            unreadCount: 0,
            updatedAt: 1,
          },
        ],
        activeMessages: [],
        status: { phase: 'connected', retryable: false },
      },
      directory: { users: [] },
      userProfiles: { ensureProfiles },
      agentDrawer: { ensureState: vi.fn() },
      agentRoles: { roles: [] },
      managedRuntime: { modelOptions: [] },
    } as unknown as TeaDesktopStores

    const scope = effectScope()
    scope.run(() => useWorkspaceViewModel(stores, createWorkspaceUiState()))

    expect(ensureProfiles).toHaveBeenCalledWith(['account-b'])
    scope.stop()
  })
})
