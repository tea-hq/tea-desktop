import { describe, expect, it, vi } from 'vitest'

import type { RuntimeConversationService } from './service'
import { RuntimeConversationCommandService } from './commandService'

describe('RuntimeConversationCommandService', () => {
  it('relocates through the main service without exposing the runtime binding', async () => {
    const detail = {
      summary: {
        conversationId: 'conversation-1',
        runtimeId: 'external.codex',
        workspaceId: 'workspace-1',
        workingDirectory: '/projects/tea',
        createdAt: 1,
        updatedAt: 2,
      },
      collaboration: { turnContexts: [], drafts: [], deliveries: [] },
    }
    const relocateConversationWorkspace = vi.fn(async () => detail)
    const service = { relocateConversationWorkspace } as unknown as RuntimeConversationService
    const commands = new RuntimeConversationCommandService(service, 'workspace-1')

    await expect(
      commands.relocateConversationWorkspace('conversation-1', '/projects/tea'),
    ).resolves.toEqual(detail)
    expect(relocateConversationWorkspace).toHaveBeenCalledWith('conversation-1', '/projects/tea')
  })

  it('adds the main-owned workspace and does not expose durable runtime bindings', async () => {
    const createConversation = vi.fn(async () => ({
      handle: {
        conversationId: 'conversation-1',
        runtimeId: 'external.codex',
        nativeSessionId: 'session-1',
        binding: {
          schemaVersion: 1 as const,
          runtimeId: 'external.codex',
          nativeSessionId: 'session-1',
          implementation: { kind: 'acp', id: 'codex.acp', revision: 1 },
          protocol: { name: 'acp', version: 2 },
          artifact: { packageName: 'agent', version: '1', integrity: 'sha512-test' },
          workspacePath: '/workspace',
          hostTools: [],
        },
      },
      summary: {
        conversationId: 'conversation-1',
        runtimeId: 'external.codex',
        workspaceId: 'workspace-1',
        createdAt: 1,
        updatedAt: 1,
      },
    }))
    const service = { createConversation } as unknown as RuntimeConversationService
    const commands = new RuntimeConversationCommandService(service, 'workspace-1')

    const result = await commands.createConversation({
      runtimeId: 'external.codex',
      idempotencyKey: 'create-1',
      hostTools: [],
    })

    expect(createConversation).toHaveBeenCalledWith({
      runtimeId: 'external.codex',
      workspaceId: 'workspace-1',
      idempotencyKey: 'create-1',
      channelBinding: undefined,
      hostTools: [],
    })
    expect(result.handle).toEqual({
      conversationId: 'conversation-1',
      runtimeId: 'external.codex',
      nativeSessionId: 'session-1',
    })
    expect(result.handle).not.toHaveProperty('binding')
  })

  it('merges mandatory Center tools into every creation without duplicates', async () => {
    const createConversation = vi.fn(async () => ({
      handle: {
        conversationId: 'conversation-1',
        runtimeId: 'external.codex',
        nativeSessionId: 'session-1',
        binding: {} as never,
      },
      summary: {
        conversationId: 'conversation-1',
        runtimeId: 'external.codex',
        workspaceId: 'workspace-1',
        createdAt: 1,
        updatedAt: 1,
      },
    }))
    const service = { createConversation } as unknown as RuntimeConversationService
    const mandatory = { name: 'tea_plugin_issues_a1', version: '1' }
    const commands = new RuntimeConversationCommandService(service, 'workspace-1', async () => [
      mandatory,
    ])

    await commands.createConversation({
      runtimeId: 'external.codex',
      idempotencyKey: 'create-1',
      hostTools: [mandatory],
    })

    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ hostTools: [mandatory] }),
    )
  })
})
