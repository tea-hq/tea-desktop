import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  CloudConversation,
  CloudConversationEvent,
  CloudRunnerTag,
  RunnerRegistrationCommand,
} from '../../packages/runner/src/protocol'
import type { ConversationSummary } from '../../src/features/conversation/contracts'
import type { CloudConversationClient } from '../../src/infrastructure/cloud/cloudRunnerClient'
import { CloudConversationCommandService } from './cloudCommandService'
import type { RuntimeConversationCommandService } from './commandService'

describe('CloudConversationCommandService', () => {
  afterEach(() => vi.useRealTimers())

  it('creates cloud conversations with immutable routing selection and projects them into the list', async () => {
    const cloud = fakeCloud()
    const create = vi.spyOn(cloud, 'createConversation')
    const local = fakeLocal({
      listConversations: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    })
    const updated: ConversationSummary[] = []
    const service = new CloudConversationCommandService(local, cloud, {
      conversationEvent: () => undefined,
      conversationUpdated: (summary) => updated.push(summary),
    })

    const result = await service.createConversation({
      runtimeId: 'acp.codex',
      idempotencyKey: 'create-1',
      hostTools: [],
      executionTarget: 'cloud',
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      runnerTags: [' gpu '],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        executionTarget: 'cloud',
        runtimeId: 'acp.codex',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        tags: [' gpu '],
      }),
      'create-1',
    )
    expect(result.summary?.executionTarget).toBe('cloud')
    expect(updated[0]?.conversationId).toBe('cloud-1')

    const page = await service.listConversations({ limit: 30 })
    expect(page.items.map((item) => item.conversationId)).toContain('cloud-1')
    service.dispose()
  })

  it('polls raw Center events once, projects terminal assistant output, and rebuilds history', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud()
    const events: CloudConversationEvent[] = [
      {
        conversationId: 'cloud-1',
        sequence: 1,
        type: 'user.prompt',
        data: { text: 'hello' },
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        conversationId: 'cloud-1',
        sequence: 2,
        type: 'assistant.message',
        data: { text: 'world' },
        terminal: true,
        createdAt: '2026-09-01T00:00:01Z',
      },
    ]
    cloud.listConversations = vi.fn(async () => [cloudValue()])
    cloud.loadEvents = vi.fn(async (_id: string, after = 0) =>
      events.filter((event) => event.sequence > after),
    )
    const projected: unknown[] = []
    const service = new CloudConversationCommandService(
      fakeLocal(),
      cloud,
      {
        conversationEvent: (event) => projected.push(event),
        conversationUpdated: () => undefined,
      },
      250,
    )
    await service.listConversations({ limit: 30 })
    await vi.advanceTimersByTimeAsync(250)

    expect(projected).toEqual([
      {
        conversationId: 'cloud-1',
        sequence: 2,
        event: { type: 'messageDelta', text: 'world', terminal: true },
      },
    ])
    const history = await service.loadConversationHistory({ conversationId: 'cloud-1', limit: 50 })
    expect(history.items).toHaveLength(1)
    expect(history.items[0]).toMatchObject({
      user: { text: 'hello' },
      status: 'completed',
      blocks: [{ kind: 'assistantText', text: 'world', streaming: false }],
    })
    expect(cloud.loadEvents).toHaveBeenCalledWith('cloud-1')
    service.dispose()
  })

  it('projects cloud ACP thoughts and tool lifecycle without duplicating the final message', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud()
    const events: CloudConversationEvent[] = [
      {
        conversationId: 'cloud-1',
        sequence: 1,
        type: 'conversation.started',
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        conversationId: 'cloud-1',
        sequence: 2,
        type: 'user.prompt',
        data: { text: 'inspect the project' },
        createdAt: '2026-09-01T00:00:01Z',
      },
      acpCloudEvent(3, {
        sessionUpdate: 'agent_thought_chunk',
        messageId: 'thought-1',
        content: { type: 'text', text: 'I will inspect the project.' },
      }),
      acpCloudEvent(4, {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Read files',
        status: 'pending',
        rawInput: { path: 'src' },
      }),
      acpCloudEvent(5, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        title: 'Reading files',
        status: 'in_progress',
      }),
      acpCloudEvent(6, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: '2 files' } }],
      }),
      acpCloudEvent(7, {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'The project is ready.' },
      }),
      {
        conversationId: 'cloud-1',
        sequence: 8,
        type: 'assistant.message',
        data: { text: 'The project is ready.' },
        terminal: true,
        createdAt: '2026-09-01T00:00:08Z',
      },
    ]
    cloud.listConversations = vi.fn(async () => [cloudValue()])
    cloud.loadEvents = vi.fn(async (_id: string, after = 0) =>
      events.filter((event) => event.sequence > after),
    )
    const projected: unknown[] = []
    const service = new CloudConversationCommandService(
      fakeLocal(),
      cloud,
      {
        conversationEvent: (event) => projected.push(event),
        conversationUpdated: () => undefined,
      },
      250,
    )

    await service.listConversations({ limit: 30 })
    await vi.advanceTimersByTimeAsync(250)

    expect(projected.map((value) => (value as { event: { type: string } }).event.type)).toEqual([
      'runStarted',
      'thoughtDelta',
      'toolRequested',
      'toolProgress',
      'toolCompleted',
      'messageDelta',
      'messageDelta',
    ])
    expect((projected.at(-1) as { event: unknown }).event).toEqual({
      type: 'messageDelta',
      text: '',
      terminal: true,
    })

    const history = await service.loadConversationHistory({ conversationId: 'cloud-1', limit: 50 })
    expect(history.items).toHaveLength(1)
    expect(history.items[0]).toMatchObject({
      user: { text: 'inspect the project' },
      status: 'completed',
      blocks: [
        {
          kind: 'agentThought',
          text: 'I will inspect the project.',
          streaming: false,
          messageId: 'thought-1',
        },
        {
          kind: 'toolCall',
          id: 'tool-1',
          name: 'Read files',
          status: 'completed',
          message: '2 files',
        },
        { kind: 'assistantText', text: 'The project is ready.', streaming: false },
      ],
    })
    service.dispose()
  })

  it('routes cloud send and cancel without exposing a runner id', async () => {
    const cloud = fakeCloud()
    const send = vi.spyOn(cloud, 'sendMessage')
    const cancel = vi.spyOn(cloud, 'cancelConversation')
    const service = new CloudConversationCommandService(fakeLocal(), cloud, {
      conversationEvent: () => undefined,
      conversationUpdated: () => undefined,
    })
    await service.listConversations({ limit: 30 })
    await service.sendMessage('cloud-1', 'next', { model: 'default', permissionMode: 'default' })
    await service.cancel('cloud-1')
    expect(send).toHaveBeenCalledWith(
      'cloud-1',
      'next',
      expect.stringMatching(/^cloud-message:cloud-1:/),
    )
    expect(cancel).toHaveBeenCalledWith('cloud-1')
    service.dispose()
  })

  it('projects cloud permission requests and routes the owner decision to Center', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud()
    const events: CloudConversationEvent[] = [
      {
        conversationId: 'cloud-1',
        sequence: 1,
        type: 'user.prompt',
        data: { text: 'edit the file' },
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        conversationId: 'cloud-1',
        sequence: 2,
        type: 'permission.requested',
        data: {
          approvalId: 'approval-1',
          request: {
            sessionId: 'session-1',
            toolCall: {
              toolCallId: 'tool-1',
              title: 'Edit file',
              kind: 'edit',
              status: 'pending',
              locations: [{ path: '/workspace/file.txt' }],
            },
            options: [
              { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
              { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
            ],
          },
        },
        createdAt: '2026-09-01T00:00:01Z',
      },
    ]
    cloud.loadEvents = vi.fn(async (_id: string, after = 0) =>
      events.filter((event) => event.sequence > after),
    )
    const projected: unknown[] = []
    const service = new CloudConversationCommandService(
      fakeLocal(),
      cloud,
      { conversationEvent: (event) => projected.push(event), conversationUpdated: () => undefined },
      250,
    )
    await service.listConversations({ limit: 30 })
    await vi.advanceTimersByTimeAsync(250)

    expect(projected).toContainEqual({
      conversationId: 'cloud-1',
      sequence: 2,
      event: {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-1',
        capabilities: ['edit'],
        resources: ['/workspace/file.txt'],
        decisions: ['allowOnce', 'deny', 'cancel'],
      },
    })
    await service.respondToApproval('cloud-1', 'approval-1', 'allowOnce')
    expect(cloud.respondToApproval).toHaveBeenCalledWith('cloud-1', 'approval-1', 'allowOnce')
    service.dispose()
  })

  it('delegates registration command generation without exposing runner ids', async () => {
    const cloud = fakeCloud()
    const command: RunnerRegistrationCommand = {
      tokenId: 'token-tenant',
      scope: 'tenant',
      scopeId: 'tenant-1',
      centerUrl: 'https://center.test',
      command: 'npx --yes @tea/runner register --token token-tenant --install-service',
    }
    cloud.createRunnerRegistrationCommand = vi.fn(async () => command)
    const service = new CloudConversationCommandService(fakeLocal(), cloud, {
      conversationEvent: () => undefined,
      conversationUpdated: () => undefined,
    })

    await expect(
      service.createRunnerRegistrationCommand({ tokenId: 'token-tenant' }),
    ).resolves.toEqual(command)
    expect(cloud.createRunnerRegistrationCommand).toHaveBeenCalledWith({ tokenId: 'token-tenant' })
    service.dispose()
  })
})

function cloudValue(): CloudConversation {
  return {
    conversationId: 'cloud-1',
    ownerSubjectId: 'user-1',
    tenantId: 'tenant-1',
    executionTarget: 'cloud',
    tags: ['linux'],
    runtimeId: 'acp.codex',
    providerId: 'openai',
    modelId: 'gpt-5.6-sol',
    status: 'running',
    workspaceRef: 'workspace-1',
    assignmentEpoch: 1,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }
}

function fakeCloud(): CloudConversationClient {
  return {
    listRunnerTags: vi.fn(async (): Promise<CloudRunnerTag[]> => []),
    listConversations: vi.fn(async () => [cloudValue()]),
    createConversation: vi.fn(async () => cloudValue()),
    getConversation: vi.fn(async () => cloudValue()),
    loadEvents: vi.fn(async () => []),
    sendMessage: vi.fn(async () => undefined),
    shareConversation: vi.fn(async () => undefined),
    deleteConversation: vi.fn(async () => undefined),
    cancelConversation: vi.fn(async () => undefined),
    respondToApproval: vi.fn(async () => undefined),
  }
}

function fakeLocal(
  overrides: Partial<Record<keyof RuntimeConversationCommandService, unknown>> = {},
) {
  return {
    listRuntimes: vi.fn(async () => []),
    listConversations: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getConversation: vi.fn(async () => {
      throw new Error('not local')
    }),
    loadConversationHistory: vi.fn(async () => ({
      items: [],
      nextCursor: null,
      hasMore: false,
      startIndex: 0,
    })),
    ...overrides,
  } as unknown as RuntimeConversationCommandService
}

function acpCloudEvent(sequence: number, update: Record<string, unknown>): CloudConversationEvent {
  return {
    conversationId: 'cloud-1',
    sequence,
    type: 'acp.session.update',
    data: {
      sessionId: 'session-1',
      update,
    },
    createdAt: `2026-09-01T00:00:${String(sequence).padStart(2, '0')}Z`,
  }
}
