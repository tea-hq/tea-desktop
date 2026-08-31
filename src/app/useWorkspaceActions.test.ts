import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '@/features/conversation/contracts'
import { createWorkspaceUiState } from './desktopAppState'
import type { TeaDesktopStores } from './desktopAppDependencies'
import { useWorkspaceActions } from './useWorkspaceActions'

const binding = {
  transportId: 'mock.channel',
  accountRef: 'account-1',
  channelRef: 'product-collab',
}

const summary: ConversationSummary = {
  conversationId: 'conversation-1',
  runtimeId: 'external.codex',
  workspaceId: 'desktop-workspace',
  createdAt: 1,
  updatedAt: 2,
  title: 'Product review',
  channelBinding: binding,
}

describe('useWorkspaceActions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('opens a collaboration session when channel history loading fails', async () => {
    const selectChannel = vi.fn().mockRejectedValue(new Error('history unavailable'))
    const bindChannel = vi.fn().mockResolvedValue(undefined)
    const selectConversation = vi.fn().mockResolvedValue(true)
    const stores = {
      conversation: {
        conversations: [summary],
        selectConversation: vi.fn(),
        markConversationSeen: vi.fn(),
      },
      channels: { selectChannel },
      collaboration: { bindChannel, selectConversation },
    } as unknown as TeaDesktopStores
    const runtime = {
      channelEnvironment: ref({
        transport: {
          status: () => ({ phase: 'connected', accountRef: binding.accountRef, retryable: false }),
          descriptor: () => ({ id: binding.transportId }),
        },
      }),
    } as never
    const ui = createWorkspaceUiState()
    const actions = useWorkspaceActions(stores, ui, runtime)

    await actions.handleSelect(summary.conversationId)

    expect(selectChannel).toHaveBeenCalledWith(binding.channelRef)
    expect(bindChannel).toHaveBeenCalledWith(binding.channelRef)
    expect(selectConversation).toHaveBeenCalledWith(summary.conversationId)
    expect(ui.collaborationWorkspace.value).toBe(true)
  })

  it('shows the collaboration surface while a channel session is restoring', async () => {
    let resolveSelection!: (value: boolean) => void
    const selectConversation = vi.fn(
      () => new Promise<boolean>((resolve) => (resolveSelection = resolve)),
    )
    const stores = {
      conversation: {
        conversations: [summary],
        selectConversation: vi.fn(),
        markConversationSeen: vi.fn(),
      },
      channels: { selectChannel: vi.fn().mockResolvedValue(undefined) },
      collaboration: {
        bindChannel: vi.fn().mockResolvedValue(undefined),
        selectConversation,
      },
    } as unknown as TeaDesktopStores
    const runtime = {
      channelEnvironment: ref({
        transport: {
          status: () => ({ phase: 'connected', accountRef: binding.accountRef, retryable: false }),
          descriptor: () => ({ id: binding.transportId }),
        },
      }),
    } as never
    const ui = createWorkspaceUiState()
    const actions = useWorkspaceActions(stores, ui, runtime)

    const selection = actions.handleSelect(summary.conversationId)
    await Promise.resolve()
    await Promise.resolve()

    expect(ui.collaborationWorkspace.value).toBe(true)
    resolveSelection(true)
    await selection
  })

  it('remembers the selected model in the workspace settings', () => {
    const selectModel = vi.fn()
    const setDefaultModel = vi.fn()
    const stores = {
      conversation: { selectModel },
      collaboration: { selectModel: vi.fn() },
      settings: { setDefaultModel },
    } as unknown as TeaDesktopStores
    const runtime = { channelEnvironment: ref(null) } as never
    const ui = createWorkspaceUiState()
    const actions = useWorkspaceActions(stores, ui, runtime)

    actions.selectActiveModel('provider/model-a')

    expect(selectModel).toHaveBeenCalledWith('provider/model-a')
    expect(setDefaultModel).toHaveBeenCalledWith('provider/model-a')
  })

  it('applies a directory selected by the native project picker', async () => {
    const setWorkingDirectory = vi.fn()
    const selectDirectory = vi.fn(async () => '/work/tea')
    const stores = {
      conversation: { setWorkingDirectory },
    } as unknown as TeaDesktopStores
    const runtime = { channelEnvironment: ref(null) } as never
    const ui = createWorkspaceUiState()
    const actions = useWorkspaceActions(stores, ui, runtime, { selectDirectory })

    await actions.selectNewConversationProject()

    expect(selectDirectory).toHaveBeenCalledOnce()
    expect(setWorkingDirectory).toHaveBeenCalledWith('/work/tea')
  })

  it('quick-creates drafts with only the requested working-directory difference', () => {
    const startNewConversation = vi.fn()
    const setWorkingDirectory = vi.fn()
    const stores = {
      conversation: { startNewConversation, setWorkingDirectory },
    } as unknown as TeaDesktopStores
    const runtime = { channelEnvironment: ref(null) } as never
    const ui = createWorkspaceUiState()
    ui.collaborationWorkspace.value = true
    const actions = useWorkspaceActions(stores, ui, runtime)

    actions.handleQuickCreate('/work/tea')
    actions.handleQuickCreate(null)

    expect(startNewConversation).toHaveBeenCalledTimes(2)
    expect(setWorkingDirectory.mock.calls).toEqual([['/work/tea'], [null]])
    expect(startNewConversation.mock.invocationCallOrder[0]).toBeLessThan(
      setWorkingDirectory.mock.invocationCallOrder[0]!,
    )
    expect(startNewConversation.mock.invocationCallOrder[1]).toBeLessThan(
      setWorkingDirectory.mock.invocationCallOrder[1]!,
    )
    expect(ui.activeMode.value).toBe('agent')
    expect(ui.collaborationWorkspace.value).toBe(false)
  })

  it('clears the local composer when the conversation accepts the message', async () => {
    const sendMessage = vi.fn().mockResolvedValue(true)
    const stores = {
      conversation: { selectedModel: 'default', sendMessage },
      settings: { setDefaultModel: vi.fn() },
    } as unknown as TeaDesktopStores
    const runtime = { channelEnvironment: ref(null) } as never
    const ui = createWorkspaceUiState()
    ui.localComposerText.value = 'Inspect the workspace'
    ui.localComposerAttachments.value = [{ id: 'brief', name: 'brief.md', size: 1024 }]
    const actions = useWorkspaceActions(stores, ui, runtime)

    await actions.sendFromFullSurface({
      text: ui.localComposerText.value,
      attachments: ui.localComposerAttachments.value,
    })

    expect(sendMessage).toHaveBeenCalledWith('Inspect the workspace', [
      { id: 'brief', name: 'brief.md', size: 1024 },
    ])
    expect(ui.localComposerText.value).toBe('')
    expect(ui.localComposerAttachments.value).toEqual([])
  })

  it('preserves the local composer when the conversation rejects the message', async () => {
    const stores = {
      conversation: {
        selectedModel: 'default',
        sendMessage: vi.fn().mockResolvedValue(false),
      },
      settings: { setDefaultModel: vi.fn() },
    } as unknown as TeaDesktopStores
    const runtime = { channelEnvironment: ref(null) } as never
    const ui = createWorkspaceUiState()
    ui.localComposerText.value = 'Inspect the workspace'
    ui.localComposerAttachments.value = [{ id: 'brief', name: 'brief.md', size: 1024 }]
    const actions = useWorkspaceActions(stores, ui, runtime)

    await actions.sendFromFullSurface({
      text: ui.localComposerText.value,
      attachments: ui.localComposerAttachments.value,
    })

    expect(ui.localComposerText.value).toBe('Inspect the workspace')
    expect(ui.localComposerAttachments.value).toEqual([
      { id: 'brief', name: 'brief.md', size: 1024 },
    ])
  })
})
