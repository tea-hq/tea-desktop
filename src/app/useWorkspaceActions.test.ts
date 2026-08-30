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
})
