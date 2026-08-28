import { describe, expect, it, vi } from 'vitest'

import type { ConversationCommandService } from '../conversation/commandService'
import { createConversationCommandHandlers } from './conversationCommands'

function commandService(): ConversationCommandService {
  return {
    listRuntimes: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    loadConversationHistory: vi.fn(),
    createConversation: vi.fn(),
    appendConversationSources: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    prepareDelivery: vi.fn(),
    updateDelivery: vi.fn(),
    sendMessage: vi.fn(),
    cancel: vi.fn(),
    respondToApproval: vi.fn(),
    resolveHostToolCall: vi.fn(),
    rename: vi.fn(),
    archive: vi.fn(),
    remove: vi.fn(),
  }
}

describe('conversation command handlers', () => {
  it('delegates one typed creation request without exposing a backend shape', async () => {
    const conversation = commandService()
    const handler = createConversationCommandHandlers({ conversation }).handlers
      .create_conversation!
    const channelBinding = {
      transportId: 'yunxin',
      accountRef: 'account-1',
      channelRef: 'channel-1',
    }
    const hostTool = {
      name: 'load_channel_messages',
      version: '1.0.0',
    }

    await handler({
      runtimeId: 'external.codex',
      idempotencyKey: 'create-1',
      channelBinding,
      hostTools: [hostTool],
    })

    expect(conversation.createConversation).toHaveBeenCalledWith({
      runtimeId: 'external.codex',
      idempotencyKey: 'create-1',
      channelBinding,
      hostTools: [hostTool],
    })
  })

  it('preserves missing and explicit-empty source selections', async () => {
    const conversation = commandService()
    const handler = createConversationCommandHandlers({ conversation }).handlers.send_message!
    const base = {
      conversationId: 'conversation-1',
      text: 'Continue',
      model: null,
      permissionMode: 'readOnly',
    }

    await handler(base)
    await handler({ ...base, sources: [] })

    expect(conversation.sendMessage).toHaveBeenNthCalledWith(1, 'conversation-1', 'Continue', {
      model: 'default',
      permissionMode: 'readOnly',
    })
    expect(conversation.sendMessage).toHaveBeenNthCalledWith(2, 'conversation-1', 'Continue', {
      model: 'default',
      permissionMode: 'readOnly',
      sources: [],
    })
  })

  it('rejects malformed arrays before delegation', async () => {
    const conversation = commandService()
    const handler = createConversationCommandHandlers({ conversation }).handlers
      .create_conversation!

    await expect(
      Promise.resolve().then(() =>
        handler({ runtimeId: 'external.codex', idempotencyKey: 'create-1', hostTools: {} }),
      ),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    expect(conversation.createConversation).not.toHaveBeenCalled()
  })

  it('rejects renderer-supplied HostTool definitions instead of accepting schemas', async () => {
    const conversation = commandService()
    const handler = createConversationCommandHandlers({ conversation }).handlers
      .create_conversation!

    await expect(
      Promise.resolve().then(() =>
        handler({
          runtimeId: 'external.codex',
          idempotencyKey: 'create-1',
          hostTools: [
            {
              name: 'load_channel_messages',
              version: '1.0.0',
              description: 'Renderer-controlled description',
              inputSchema: { type: 'object' },
              outputSchema: { type: 'object' },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalidRequest', retryable: false })
    expect(conversation.createConversation).not.toHaveBeenCalled()
  })
})
