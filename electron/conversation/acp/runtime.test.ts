import { PassThrough } from 'node:stream'

import * as acpV1 from '@agentclientprotocol/sdk'
import * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'
import { describe, expect, it, vi } from 'vitest'

import type {
  ConversationEvent,
  HostToolDefinition,
  SendMessageOptions,
} from '../../../src/features/conversation/contracts'
import type { ConversationToolScope } from '../toolBroker'
import { officialAcpAgentDefinitions } from './agentCatalog'
import type { ResolvedAcpAgentArtifact } from './agentDefinition'
import { createAcpConversationBinding } from './binding'
import {
  AcpAgentConnection,
  type AcpInitialization,
  type AcpProtocolConnection,
  type AcpProtocolHandlers,
} from './connection'
import { AcpHostError } from './errors'
import type { AcpMcpAttachmentFactoryPort, AcpMcpAttachmentOwner } from './mcpAttachmentFactory'
import { createAcpMcpServerConfiguration } from './mcpEntrypoint'
import type { AcpProcess } from './process'
import {
  AcpConversationRuntime,
  type AcpConnectionFactoryPort,
  type AcpConversationRuntimeOptions,
  type AcpConversationToolBrokerPort,
} from './runtime'

const DEFAULT_OPTIONS: SendMessageOptions = {
  model: 'default',
  permissionMode: 'default',
}

const HOST_TOOL: HostToolDefinition = {
  name: 'tea.channel.history',
  version: '1',
  description: 'Load selected Channel history',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
}

describe('AcpConversationRuntime', () => {
  it.each(['relative/workspace', `/${'x'.repeat(4097)}`, '/bad\0workspace'])(
    'rejects an invalid workspace before connecting: %s',
    (workspacePath) => {
      expect(
        () =>
          new AcpConversationRuntime(officialAcpAgentDefinitions()[0], workspacePath, {
            connect: vi.fn(),
          }),
      ).toThrowError(expect.objectContaining({ code: 'invalidConfiguration' }))
    },
  )

  it('runs a V1 turn and returns the exact permission option selected by Tea', async () => {
    const harness = createHarness(1)
    const handle = await harness.runtime.createConversation('conversation-1')
    const events: ConversationEvent[] = []
    harness.runtime.subscribe('conversation-1', (event) => events.push(event))

    expect(handle).toEqual({
      conversationId: 'conversation-1',
      runtimeId: 'external.claude',
      nativeSessionId: 'session-1',
      binding: {
        schemaVersion: 1,
        runtimeId: 'external.claude',
        nativeSessionId: 'session-1',
        implementation: {
          kind: 'acp',
          id: officialAcpAgentDefinitions()[0].id,
          revision: 1,
        },
        protocol: { name: 'acp', version: 1 },
        artifact: officialAcpAgentDefinitions()[0].artifact,
        workspacePath: '/workspace',
        hostTools: [],
      },
    })
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Inspect the workspace',
      options: DEFAULT_OPTIONS,
    })
    await harness.handlers().sessionUpdate({
      wireVersion: 1,
      notification: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Inspecting.' },
        },
      },
    })
    const permission = harness.handlers().requestPermission({
      wireVersion: 1,
      requestId: 41,
      request: {
        sessionId: 'session-1',
        toolCall: {
          toolCallId: 'tool-1',
          title: 'Read file',
          kind: 'read',
          status: 'pending',
          locations: [{ path: '/workspace/file.txt' }],
        },
        options: [
          { optionId: 'agent-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'agent-deny', name: 'Deny', kind: 'reject_once' },
        ],
      },
    })
    const approval = events.find((event) => event.event.type === 'approvalRequested')
    if (approval?.event.type !== 'approvalRequested') throw new Error('approval was not emitted')

    await expect(
      harness.runtime.resolveApproval('conversation-1', approval.event.approvalId, 'allowSession'),
    ).rejects.toMatchObject({ code: 'invalidState' })
    await harness.runtime.resolveApproval('conversation-1', approval.event.approvalId, 'allowOnce')
    await expect(permission).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'agent-once' },
    })
    harness.prompt.resolve({ stopReason: 'end_turn' })
    await send

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4])
    expect(events.map((event) => event.event.type)).toEqual([
      'runStarted',
      'messageDelta',
      'approvalRequested',
      'runFinished',
    ])
  })

  it('injects provider routing before creating a session', async () => {
    const harness = createHarness(1)

    await harness.runtime.createConversation('conversation-1', {
      model: 'gpt-5.6-luna',
      provider: {
        providerId: 'tokbox',
        kind: 'openai_compatible',
        displayName: 'Tokbox',
        baseUrl: 'https://models.example.test/v1',
        apiKey: 'provider-secret',
        modelId: 'gpt-5.6-luna',
        modelIds: ['gpt-5.6-luna'],
      },
    })

    expect(harness.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cwd: '/workspace',
        injectedEnvironment: expect.objectContaining({
          CLAUDE_MODEL_CONFIG: JSON.stringify({ availableModels: ['gpt-5.6-luna'] }),
          ANTHROPIC_BASE_URL: 'https://models.example.test/v1',
        }),
      }),
      expect.anything(),
    )
  })

  it('passes a per-conversation workspace to the Agent process and ACP session', async () => {
    const harness = createHarness(2)

    await harness.runtime.createConversation('conversation-1', {
      model: 'default',
      workspacePath: '/projects/tea',
    })

    expect(harness.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cwd: '/projects/tea' }),
      expect.anything(),
    )
    expect(harness.request).toHaveBeenCalledWith('session/new', {
      cwd: '/projects/tea',
      mcpServers: [],
    })
  })

  it('injects provider routing before restoring a session', async () => {
    const harness = createHarness(2, {
      initialization: { supportsResumeSession: true },
      request: (method) => {
        if (method === 'session/resume' || method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    const binding = conversationBinding(2)
    binding.selection = { providerId: 'tokbox', modelId: 'gpt-5.6-luna' }

    await harness.runtime.restoreConversation('conversation-1', binding, {
      model: 'gpt-5.6-luna',
      provider: {
        providerId: 'tokbox',
        kind: 'openai_compatible',
        displayName: 'Tokbox',
        baseUrl: 'https://models.example.test/v1',
        apiKey: 'provider-secret',
        modelId: 'gpt-5.6-luna',
        modelIds: ['gpt-5.6-luna'],
      },
    })

    expect(harness.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cwd: '/workspace',
        injectedEnvironment: expect.objectContaining({
          CLAUDE_MODEL_CONFIG: JSON.stringify({ availableModels: ['gpt-5.6-luna'] }),
          ANTHROPIC_BASE_URL: 'https://models.example.test/v1',
        }),
      }),
      expect.anything(),
      2,
    )
  })

  it('fails a turn once when an update belongs to another session', async () => {
    const harness = createHarness(1)
    await harness.runtime.createConversation('conversation-1')
    const events: ConversationEvent[] = []
    harness.runtime.subscribe('conversation-1', (event) => events.push(event))
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Hello',
      options: DEFAULT_OPTIONS,
    })

    await expect(
      harness.handlers().sessionUpdate({
        wireVersion: 1,
        notification: {
          sessionId: 'wrong-session',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'wrong' },
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'invalidState' })
    await send
    harness.prompt.resolve({ stopReason: 'end_turn' })
    await Promise.resolve()

    expect(events.filter((event) => terminal(event)).map((event) => event.event.type)).toEqual([
      'runFailed',
    ])
  })

  it('cancels immediately and ignores a later duplicate V1 stop', async () => {
    const harness = createHarness(1)
    await harness.runtime.createConversation('conversation-1')
    const events: ConversationEvent[] = []
    harness.runtime.subscribe('conversation-1', (event) => events.push(event))
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Long task',
      options: DEFAULT_OPTIONS,
    })

    await harness.runtime.cancel('conversation-1')
    await send
    expect(harness.notify).toHaveBeenCalledWith('session/cancel', { sessionId: 'session-1' })
    harness.prompt.resolve({ stopReason: 'cancelled' })
    await Promise.resolve()

    expect(events.filter(terminal)).toHaveLength(1)
    expect(events.at(-1)?.event).toEqual({
      type: 'runFailed',
      failure: { code: 'cancelled', retryable: false },
    })
  })

  it('waits for the V2 idle state and rejects a duplicate terminal update', async () => {
    const harness = createHarness(2)
    await harness.runtime.createConversation('conversation-1')
    const events: ConversationEvent[] = []
    harness.runtime.subscribe('conversation-1', (event) => events.push(event))
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Hello V2',
      options: DEFAULT_OPTIONS,
    })
    await harness.handlers().sessionUpdate({
      wireVersion: 2,
      notification: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'message-1',
          content: { type: 'text', text: 'Hello' },
        },
      },
    })
    const terminalUpdate = {
      wireVersion: 2 as const,
      notification: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'state_update' as const,
          state: 'idle' as const,
          stopReason: 'end_turn',
        },
      },
    }
    await harness.handlers().sessionUpdate(terminalUpdate)
    await send

    await expect(harness.handlers().sessionUpdate(terminalUpdate)).rejects.toMatchObject({
      code: 'invalidState',
    })
    expect(events.filter(terminal)).toHaveLength(1)
    expect(events.at(-1)?.event.type).toBe('runFinished')
  })

  it('maps connection failures to a stable runtime error', async () => {
    const factory: AcpConnectionFactoryPort = {
      connect: vi.fn(async () => {
        throw new AcpHostError('connectionFailed', 'Agent unavailable', true)
      }),
    }
    const runtime = new AcpConversationRuntime(
      officialAcpAgentDefinitions()[0],
      '/workspace',
      factory,
    )

    await expect(runtime.createConversation('conversation-1')).rejects.toMatchObject({
      code: 'connectionFailed',
      retryable: true,
      message: 'Agent unavailable',
    })
  })

  it.each([1, 2] as const)(
    'generates and cleans up a subject through one disposable V%s session without HostTools',
    async (version) => {
      const harness = createHarness(version)
      const generation = harness.runtime.generateSubject('请修复移动端登录按钮')
      await vi.waitFor(() =>
        expect(harness.request).toHaveBeenCalledWith('session/prompt', {
          sessionId: 'session-1',
          prompt: [
            {
              type: 'text',
              text: expect.stringContaining('请修复移动端登录按钮'),
            },
          ],
        }),
      )

      await harness.handlers().sessionUpdate({
        wireVersion: version,
        notification: {
          sessionId: 'session-1',
          update:
            version === 1
              ? {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: '**移动端登录故障。**' },
                }
              : {
                  sessionUpdate: 'agent_message_chunk',
                  messageId: 'subject-message',
                  content: { type: 'text', text: '**移动端登录故障。**' },
                },
        },
      } as never)
      if (version === 1) harness.prompt.resolve({ stopReason: 'end_turn' })
      else {
        await harness.handlers().sessionUpdate({
          wireVersion: 2,
          notification: {
            sessionId: 'session-1',
            update: { sessionUpdate: 'state_update', state: 'idle', stopReason: 'end_turn' },
          },
        })
      }

      await expect(generation).resolves.toBe('移动端登录故障')
      expect(harness.request).toHaveBeenCalledWith('session/new', {
        cwd: '/workspace',
        mcpServers: [],
      })
      expect(harness.request).toHaveBeenCalledWith('session/close', { sessionId: 'session-1' })
      expect(harness.protocolClose).toHaveBeenCalledOnce()
      expect(harness.processClose).toHaveBeenCalledOnce()
      await expect(harness.runtime.loadSnapshot('acp-subject-1')).rejects.toMatchObject({
        code: 'unknownConversation',
      })
    },
  )

  it('rejects empty, equivalent, oversized, and Agent-failed subject output', async () => {
    for (const test of [
      { output: ' \n ', stopReason: 'end_turn', code: 'invalidState' },
      { output: 'Fix login.', stopReason: 'end_turn', code: 'invalidState' },
      { output: 'x'.repeat(4_097), stopReason: 'end_turn', code: 'invalidState' },
      { output: 'Login repair', stopReason: 'refusal', code: 'connectionFailed' },
    ] as const) {
      const harness = createHarness(1)
      const generation = harness.runtime.generateSubject('Fix login')
      await vi.waitFor(() =>
        expect(harness.request).toHaveBeenCalledWith('session/prompt', expect.anything()),
      )
      await harness.handlers().sessionUpdate({
        wireVersion: 1,
        notification: {
          sessionId: 'session-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: test.output },
          },
        },
      })
      harness.prompt.resolve({ stopReason: test.stopReason })

      await expect(generation).rejects.toMatchObject({ code: test.code })
      expect(harness.processClose).toHaveBeenCalledOnce()
    }
    await expect(createHarness(1).runtime.generateSubject(' \n ')).rejects.toMatchObject({
      code: 'invalidState',
    })
  })

  it('rejects subject output from a session that used an Agent tool', async () => {
    const harness = createHarness(1)
    const generation = harness.runtime.generateSubject('Fix login')
    await vi.waitFor(() =>
      expect(harness.request).toHaveBeenCalledWith('session/prompt', expect.anything()),
    )
    await harness.handlers().sessionUpdate({
      wireVersion: 1,
      notification: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          title: 'Read workspace',
          kind: 'read',
          status: 'pending',
          rawInput: {},
        },
      },
    })
    await harness.handlers().sessionUpdate({
      wireVersion: 1,
      notification: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Login repair' },
        },
      },
    })
    harness.prompt.resolve({ stopReason: 'end_turn' })

    await expect(generation).rejects.toMatchObject({ code: 'invalidState' })
  })

  it('coalesces duplicate subject generation and cancels it deterministically on timeout', async () => {
    const scheduler = manualScheduler()
    const harness = createHarness(1, {
      runtimeOptions: { subjectTimeoutMs: 10, scheduler },
    })
    const first = harness.runtime.generateSubject('Long subject request')
    const duplicate = harness.runtime.generateSubject('Long subject request')
    await vi.waitFor(() =>
      expect(harness.request).toHaveBeenCalledWith('session/prompt', expect.anything()),
    )

    scheduler.fire()

    await expect(first).rejects.toMatchObject({
      code: 'connectionFailed',
      retryable: true,
      message: 'ACP subject generation timed out',
    })
    await expect(duplicate).rejects.toMatchObject({ code: 'connectionFailed' })
    expect(harness.connect).toHaveBeenCalledOnce()
    expect(harness.notify).toHaveBeenCalledWith('session/cancel', { sessionId: 'session-1' })
    expect(harness.processClose).toHaveBeenCalledOnce()
  })

  it('cancels a pending disposable subject before runtime shutdown completes', async () => {
    const harness = createHarness(1)
    const generation = harness.runtime.generateSubject('Pending subject')
    await vi.waitFor(() =>
      expect(harness.request).toHaveBeenCalledWith('session/prompt', expect.anything()),
    )

    await harness.runtime.shutdown()

    await expect(generation).rejects.toMatchObject({ code: 'shutDown' })
    expect(harness.processClose).toHaveBeenCalledOnce()
  })

  it('rejects concurrent creation of the same product conversation', async () => {
    const harness = createHarness(1)
    const first = harness.runtime.createConversation('conversation-1')

    await expect(harness.runtime.createConversation('conversation-1')).rejects.toMatchObject({
      code: 'invalidState',
    })
    await expect(first).resolves.toMatchObject({ nativeSessionId: 'session-1' })
    expect(harness.connect).toHaveBeenCalledOnce()
  })

  it('cancels permissions and closes session/process once during shutdown', async () => {
    const harness = createHarness(1)
    await harness.runtime.createConversation('conversation-1')
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Needs permission',
      options: DEFAULT_OPTIONS,
    })
    const permission = harness.handlers().requestPermission({
      wireVersion: 1,
      requestId: 'permission-1',
      request: {
        sessionId: 'session-1',
        toolCall: { toolCallId: 'tool-1', title: 'Edit', kind: 'edit', status: 'pending' },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      },
    })

    await harness.runtime.shutdown()
    await harness.runtime.shutdown()
    await send
    await expect(permission).resolves.toEqual({ outcome: { outcome: 'cancelled' } })
    expect(harness.protocolClose).toHaveBeenCalledOnce()
    expect(harness.processClose).toHaveBeenCalledOnce()
    expect(harness.request).toHaveBeenCalledWith('session/close', { sessionId: 'session-1' })
    await expect(
      harness.runtime.sendMessage({
        conversationId: 'conversation-1',
        text: 'Too late',
        options: DEFAULT_OPTIONS,
      }),
    ).rejects.toMatchObject({ code: 'shutDown' })
  })

  it('closes one conversation idempotently without affecting another session', async () => {
    const harness = createHarness(1)
    await harness.runtime.createConversation('conversation-1')
    await harness.runtime.createConversation('conversation-2')

    await harness.runtime.closeConversation('conversation-1')
    await harness.runtime.closeConversation('conversation-1')

    await expect(harness.runtime.loadSnapshot('conversation-1')).rejects.toMatchObject({
      code: 'unknownConversation',
    })
    await expect(harness.runtime.loadSnapshot('conversation-2')).resolves.toMatchObject({
      conversationId: 'conversation-2',
    })
    expect(harness.request).toHaveBeenCalledWith('session/close', { sessionId: 'session-1' })
  })

  it.each([1, 2] as const)(
    'attaches one immutable HostTool scope to the V%s session/new request',
    async (version) => {
      const hostTools = createHostToolsDependencies(version)
      const harness = createHarness(version, hostTools)

      await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
      await harness.runtime.createConversation('conversation-1')

      expect(hostTools.broker.configureConversation).toHaveBeenCalledWith('conversation-1', [
        HOST_TOOL,
      ])
      expect(hostTools.broker.openScope).toHaveBeenCalledWith('conversation-1')
      expect(hostTools.attachmentFactory.create).toHaveBeenCalledWith(hostTools.scope, version)
      expect(harness.request).toHaveBeenCalledWith('session/new', {
        cwd: '/workspace',
        mcpServers: [hostTools.configuration.server],
      })
    },
  )

  it('reattaches the exact immutable HostTool selection during resume', async () => {
    const hostTools = createHostToolsDependencies(2)
    const harness = createHarness(2, {
      broker: hostTools.broker,
      attachmentFactory: hostTools.attachmentFactory,
      initialization: { supportsResumeSession: true },
      request: (method) => {
        if (method === 'session/resume' || method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])

    await harness.runtime.restoreConversation(
      'conversation-1',
      conversationBinding(2, 'session-restored', [HOST_TOOL]),
    )

    expect(hostTools.attachmentFactory.create).toHaveBeenCalledWith(hostTools.scope, 2)
    expect(harness.request).toHaveBeenCalledWith('session/resume', {
      sessionId: 'session-restored',
      cwd: '/workspace',
      mcpServers: [hostTools.configuration.server],
    })
  })

  it('keeps an explicit empty HostTool selection out of ACP and the relay lifecycle', async () => {
    const hostTools = createHostToolsDependencies(1)
    const harness = createHarness(1, hostTools)

    await harness.runtime.configureHostTools('conversation-1', [])
    await harness.runtime.createConversation('conversation-1')

    expect(hostTools.broker.openScope).toHaveBeenCalledOnce()
    expect(hostTools.attachmentFactory.create).not.toHaveBeenCalled()
    expect(harness.request).toHaveBeenCalledWith('session/new', {
      cwd: '/workspace',
      mcpServers: [],
    })
  })

  it('closes a failed attachment and removes its broker scope when session creation fails', async () => {
    const ready = deferred<void>()
    const hostTools = createHostToolsDependencies(1, ready.promise)
    const harness = createHarness(1, hostTools)
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
    const creation = harness.runtime.createConversation('conversation-1')
    await hostTools.created.promise

    ready.reject(new AcpHostError('connectionFailed', 'MCP attach failed', true))

    await expect(creation).rejects.toMatchObject({ code: 'connectionFailed', retryable: true })
    expect(hostTools.attachment.close).toHaveBeenCalledOnce()
    expect(hostTools.broker.removeConversation).toHaveBeenCalledWith('conversation-1')
    expect(harness.protocolClose).toHaveBeenCalledOnce()
  })

  it('rejects HostTool reconfiguration after creation starts without mutating the scope', async () => {
    const ready = deferred<void>()
    const hostTools = createHostToolsDependencies(1, ready.promise)
    const harness = createHarness(1, hostTools)
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
    const creation = harness.runtime.createConversation('conversation-1')
    await hostTools.created.promise

    await expect(harness.runtime.configureHostTools('conversation-1', [])).rejects.toMatchObject({
      code: 'invalidState',
    })
    expect(hostTools.broker.configureConversation).toHaveBeenCalledOnce()

    ready.resolve(undefined)
    await creation
    await expect(
      harness.runtime.configureHostTools('conversation-1', [HOST_TOOL]),
    ).rejects.toMatchObject({ code: 'invalidState' })
    expect(hostTools.broker.configureConversation).toHaveBeenCalledOnce()
  })

  it('keeps the session attachment across turn cancellation and closes it once on shutdown', async () => {
    const hostTools = createHostToolsDependencies(1)
    const harness = createHarness(1, hostTools)
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
    await harness.runtime.createConversation('conversation-1')
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Long task',
      options: DEFAULT_OPTIONS,
    })

    await harness.runtime.cancel('conversation-1')
    await send
    expect(hostTools.attachment.close).not.toHaveBeenCalled()

    await harness.runtime.shutdown()
    await harness.runtime.shutdown()
    expect(hostTools.attachment.close).toHaveBeenCalledOnce()
    expect(hostTools.broker.removeConversation).toHaveBeenCalledOnce()
  })

  it('removes the immutable HostTool scope when one conversation closes', async () => {
    const hostTools = createHostToolsDependencies(1)
    const harness = createHarness(1, hostTools)
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
    await harness.runtime.createConversation('conversation-1')

    await harness.runtime.closeConversation('conversation-1')
    await harness.runtime.closeConversation('conversation-1')

    expect(hostTools.attachment.close).toHaveBeenCalledOnce()
    expect(hostTools.broker.removeConversation).toHaveBeenCalledOnce()
  })

  it('fails the active turn and closes the Agent connection when the attachment is lost', async () => {
    const hostTools = createHostToolsDependencies(1)
    const harness = createHarness(1, hostTools)
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
    await harness.runtime.createConversation('conversation-1')
    const events: ConversationEvent[] = []
    harness.runtime.subscribe('conversation-1', (event) => events.push(event))
    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Use a HostTool',
      options: DEFAULT_OPTIONS,
    })

    hostTools.closed.resolve(undefined)
    await send

    expect(events.filter(terminal).map((event) => event.event.type)).toEqual(['runFailed'])
    expect(harness.protocolClose).toHaveBeenCalledOnce()
  })

  it('keeps incomplete capabilities explicit and unavailable', async () => {
    const harness = createHarness(1)
    expect(harness.runtime.descriptor()).toMatchObject({
      status: 'unavailable',
      capabilities: ['approval', 'cancel', 'events', 'prompt', 'subject'],
    })
    const handle = await harness.runtime.createConversation('conversation-1')

    await expect(
      harness.runtime.sendMessage({
        conversationId: 'conversation-1',
        text: 'Use another model',
        options: { ...DEFAULT_OPTIONS, model: 'model-x' },
      }),
    ).rejects.toMatchObject({ code: 'invalidConfiguration' })
    await expect(harness.runtime.loadSnapshot('conversation-1')).resolves.toEqual({
      conversationId: 'conversation-1',
      nativeSessionId: 'session-1',
      turns: [],
    })
    await expect(
      harness.runtime.loadHistory({ conversationId: 'conversation-1', limit: 10 }),
    ).resolves.toEqual({ items: [], nextCursor: null, hasMore: false, startIndex: 0 })
    await expect(
      harness.runtime.restoreConversation('conversation-1', handle.binding),
    ).rejects.toMatchObject({ code: 'invalidState' })
  })

  it('applies only advertised V1 model and permission-mode mappings before the prompt', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const harness = createHarness(1, {
      request: (method, params) => {
        calls.push({ method, params })
        if (method === 'session/set_config_option') {
          return Promise.resolve({
            configOptions: v1ConfigOptions('sonnet', 'default'),
          })
        }
        if (method === 'session/set_mode') return Promise.resolve({})
        if (method === 'session/prompt') return Promise.resolve({ stopReason: 'end_turn' })
        if (method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    await harness.runtime.createConversation('conversation-1')

    await harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Use the selected configuration',
      options: { model: 'sonnet', permissionMode: 'fullAccess' },
    })

    expect(calls).toEqual([
      {
        method: 'session/set_config_option',
        params: { sessionId: 'session-1', configId: 'model', value: 'sonnet' },
      },
      {
        method: 'session/set_mode',
        params: { sessionId: 'session-1', modeId: 'bypassPermissions' },
      },
      {
        method: 'session/prompt',
        params: {
          sessionId: 'session-1',
          prompt: [{ type: 'text', text: 'Use the selected configuration' }],
        },
      },
    ])
  })

  it('maps V2 permission modes through the advertised mode config option', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const harness = createHarness(2, {
      request: (method, params) => {
        calls.push({ method, params })
        if (method === 'session/set_config_option') {
          const requested = params as { configId: string; value: string }
          return Promise.resolve({
            configOptions: v2ConfigOptions(
              requested.configId === 'model' ? requested.value : 'default',
              requested.configId === 'mode' ? requested.value : 'default',
            ),
          })
        }
        if (method === 'session/prompt') return Promise.resolve({})
        if (method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    await harness.runtime.createConversation('conversation-1')

    const send = harness.runtime.sendMessage({
      conversationId: 'conversation-1',
      text: 'Plan this change',
      options: { model: 'sonnet', permissionMode: 'readOnly' },
    })
    await waitForRequest(harness.request, 'session/prompt')
    await harness.handlers().sessionUpdate({
      wireVersion: 2,
      notification: {
        sessionId: 'session-1',
        update: { sessionUpdate: 'state_update', state: 'idle', stopReason: 'end_turn' },
      },
    })
    await send

    expect(calls.slice(0, 2)).toEqual([
      {
        method: 'session/set_config_option',
        params: {
          sessionId: 'session-1',
          configId: 'model',
          type: 'id',
          value: 'sonnet',
        },
      },
      {
        method: 'session/set_config_option',
        params: { sessionId: 'session-1', configId: 'mode', type: 'id', value: 'plan' },
      },
    ])
  })

  it('rejects an unadvertised model before creating a turn', async () => {
    const harness = createHarness(1)
    await harness.runtime.createConversation('conversation-1')

    await expect(
      harness.runtime.sendMessage({
        conversationId: 'conversation-1',
        text: 'Use an unknown model',
        options: { model: 'unknown-model', permissionMode: 'default' },
      }),
    ).rejects.toMatchObject({ code: 'invalidConfiguration' })
    expect(harness.request).not.toHaveBeenCalledWith('session/prompt', expect.anything())
    await expect(harness.runtime.loadSnapshot('conversation-1')).resolves.toMatchObject({
      turns: [],
    })
  })

  it('restores V1 through session/load and publishes only the completed replay', async () => {
    const load = deferred<void>()
    const loadRequested = deferred<void>()
    const harness = createHarness(1, {
      initialization: { supportsLoadSession: true },
      request: (method) => {
        if (method === 'session/load') {
          loadRequested.resolve(undefined)
          return load.promise
        }
        if (method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    const binding = conversationBinding(1, 'session-restored')
    const restoration = harness.runtime.restoreConversation('conversation-1', binding)
    await loadRequested.promise

    await harness.handlers().sessionUpdate({
      wireVersion: 1,
      notification: {
        sessionId: 'session-restored',
        update: {
          sessionUpdate: 'user_message_chunk',
          messageId: 'user-1',
          content: { type: 'text', text: 'Recovered prompt' },
        },
      },
    })
    await harness.handlers().sessionUpdate({
      wireVersion: 1,
      notification: {
        sessionId: 'session-restored',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          messageId: 'thought-1',
          content: { type: 'text', text: 'Inspecting the recorded turn.' },
        },
      },
    })
    await harness.handlers().sessionUpdate({
      wireVersion: 1,
      notification: {
        sessionId: 'session-restored',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Recovered answer' },
        },
      },
    })
    await expect(harness.runtime.loadSnapshot('conversation-1')).rejects.toMatchObject({
      code: 'unknownConversation',
    })
    load.resolve(undefined)

    const handle = await restoration
    expect(handle.binding).toEqual(binding)
    expect(harness.connect.mock.calls[0][3]).toBe(1)
    expect(harness.request).toHaveBeenCalledWith('session/load', {
      sessionId: 'session-restored',
      cwd: '/workspace',
      mcpServers: [],
    })
    const snapshot = await harness.runtime.loadSnapshot('conversation-1')
    expect(snapshot).toMatchObject({
      conversationId: 'conversation-1',
      nativeSessionId: 'session-restored',
      turns: [
        {
          user: { id: 'user-1', text: 'Recovered prompt' },
          status: 'completed',
          blocks: [
            {
              kind: 'agentThought',
              text: 'Inspecting the recorded turn.',
              streaming: false,
              messageId: 'thought-1',
            },
            { kind: 'assistantText', text: 'Recovered answer', streaming: false },
          ],
        },
      ],
    })

    snapshot.turns[0].user.text = 'mutated'
    expect((await harness.runtime.loadSnapshot('conversation-1')).turns[0].user.text).toBe(
      'Recovered prompt',
    )
  })

  it('times out a restore that never completes and closes its resources', async () => {
    vi.useFakeTimers()
    try {
      const loadRequested = deferred<void>()
      const harness = createHarness(1, {
        initialization: { supportsLoadSession: true },
        runtimeOptions: { restoreTimeoutMs: 1_000 },
        request: (method) => {
          if (method === 'session/load') {
            loadRequested.resolve(undefined)
            return new Promise(() => undefined)
          }
          if (method === 'session/close') return Promise.resolve({})
          return Promise.reject(new Error(`unexpected ACP request: ${method}`))
        },
      })
      const restoration = harness.runtime.restoreConversation(
        'conversation-1',
        conversationBinding(1),
      )
      await loadRequested.promise

      const rejection = expect(restoration).rejects.toMatchObject({
        code: 'connectionFailed',
        message: 'ACP session restore timed out: conversation-1',
        retryable: true,
      })
      await vi.advanceTimersByTimeAsync(1_000)
      await rejection

      expect(harness.protocolClose).toHaveBeenCalledOnce()
      expect(harness.processClose).toHaveBeenCalledOnce()
      await expect(harness.runtime.loadSnapshot('conversation-1')).rejects.toMatchObject({
        code: 'unknownConversation',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([1, 2] as const)(
    'restores V%s through session/resume without claiming complete history',
    async (version) => {
      const harness = createHarness(version, {
        initialization: { supportsLoadSession: false, supportsResumeSession: true },
        request: (method) => {
          if (method === 'session/resume' || method === 'session/prompt') return Promise.resolve({})
          if (method === 'session/close') return Promise.resolve({})
          return Promise.reject(new Error(`unexpected ACP request: ${method}`))
        },
      })
      const binding = conversationBinding(version, 'session-restored')

      await expect(
        harness.runtime.restoreConversation('conversation-1', binding),
      ).resolves.toMatchObject({ nativeSessionId: 'session-restored' })

      expect(harness.connect.mock.calls[0][3]).toBe(version)
      expect(harness.request).toHaveBeenCalledWith('session/resume', {
        sessionId: 'session-restored',
        cwd: '/workspace',
        mcpServers: [],
      })
      await expect(harness.runtime.loadSnapshot('conversation-1')).rejects.toMatchObject({
        code: 'unsupportedCapability',
      })
      await expect(
        harness.runtime.loadHistory({ conversationId: 'conversation-1', limit: 10 }),
      ).rejects.toMatchObject({ code: 'unsupportedCapability' })
    },
  )

  it('restores a binding with its recorded per-conversation workspace', async () => {
    const hostTools = createHostToolsDependencies(1)
    const harness = createHarness(1, {
      ...hostTools,
      initialization: { supportsLoadSession: false, supportsResumeSession: true },
      request: (method) => {
        if (method === 'session/resume' || method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    await harness.runtime.configureHostTools('conversation-1', [HOST_TOOL])
    const binding = conversationBinding(1, 'session-restored', [HOST_TOOL])
    const changed = structuredClone(binding)
    changed.workspacePath = '/other'

    await expect(
      harness.runtime.restoreConversation('conversation-1', changed),
    ).resolves.toMatchObject({
      nativeSessionId: 'session-restored',
    })
    expect(harness.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cwd: '/other' }),
      expect.anything(),
      1,
    )
  })

  it('rejects restore when neither load nor resume is advertised and closes resources', async () => {
    const harness = createHarness(1, {
      initialization: { supportsLoadSession: false, supportsResumeSession: false },
    })

    await expect(
      harness.runtime.restoreConversation('conversation-1', conversationBinding(1)),
    ).rejects.toMatchObject({ code: 'unsupportedCapability' })
    expect(harness.protocolClose).toHaveBeenCalledOnce()
    expect(harness.processClose).toHaveBeenCalledOnce()
  })

  it('does not publish a restore after a replay handler rejected malformed history', async () => {
    const load = deferred<void>()
    const loadRequested = deferred<void>()
    const harness = createHarness(1, {
      initialization: { supportsLoadSession: true },
      request: (method) => {
        if (method === 'session/load') {
          loadRequested.resolve(undefined)
          return load.promise
        }
        if (method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    const restoration = harness.runtime.restoreConversation(
      'conversation-1',
      conversationBinding(1),
    )
    await loadRequested.promise

    await expect(
      harness.handlers().sessionUpdate({
        wireVersion: 1,
        notification: {
          sessionId: 'other-session',
          update: {
            sessionUpdate: 'user_message_chunk',
            content: { type: 'text', text: 'wrong' },
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'invalidState' })
    load.resolve(undefined)

    await expect(restoration).rejects.toMatchObject({ code: 'invalidState' })
    await expect(harness.runtime.loadSnapshot('conversation-1')).rejects.toMatchObject({
      code: 'unknownConversation',
    })
    expect(harness.protocolClose).toHaveBeenCalledOnce()
  })

  it('paginates complete runtime history and rejects invalid cursors and limits', async () => {
    const harness = createHarness(1, {
      request: (method) => {
        if (method === 'session/new') return Promise.resolve({ sessionId: 'session-1' })
        if (method === 'session/prompt') return Promise.resolve({ stopReason: 'end_turn' })
        if (method === 'session/close') return Promise.resolve({})
        return Promise.reject(new Error(`unexpected ACP request: ${method}`))
      },
    })
    await harness.runtime.createConversation('conversation-1')
    for (const text of ['one', 'two', 'three']) {
      await harness.runtime.sendMessage({
        conversationId: 'conversation-1',
        text,
        options: DEFAULT_OPTIONS,
      })
    }

    await expect(
      harness.runtime.loadHistory({ conversationId: 'conversation-1', limit: 2 }),
    ).resolves.toMatchObject({
      items: [{ user: { text: 'two' } }, { user: { text: 'three' } }],
      nextCursor: '1',
      hasMore: true,
      startIndex: 1,
    })
    await expect(
      harness.runtime.loadHistory({ conversationId: 'conversation-1', cursor: '1', limit: 2 }),
    ).resolves.toMatchObject({
      items: [{ user: { text: 'one' } }],
      nextCursor: null,
      hasMore: false,
      startIndex: 0,
    })
    await expect(
      harness.runtime.loadHistory({ conversationId: 'conversation-1', cursor: 'bad', limit: 2 }),
    ).rejects.toMatchObject({ code: 'invalidHistoryCursor' })
    await expect(
      harness.runtime.loadHistory({ conversationId: 'conversation-1', limit: 0 }),
    ).rejects.toMatchObject({ code: 'invalidHistoryLimit' })
  })
})

function createHarness(
  version: 1 | 2,
  dependencies: {
    broker?: AcpConversationToolBrokerPort
    attachmentFactory?: AcpMcpAttachmentFactoryPort
    initialization?: Partial<AcpInitialization>
    request?: (method: string, params: unknown) => unknown
    runtimeOptions?: AcpConversationRuntimeOptions
  } = {},
) {
  const definition = officialAcpAgentDefinitions()[0]
  const artifact: ResolvedAcpAgentArtifact = {
    definition,
    packageRoot: '/package',
    packageJsonPath: '/package/package.json',
    entrypointPath: '/package/dist/index.js',
  }
  const prompt = deferred<acpV1.PromptResponse>()
  const request = vi.fn((method: string, params: unknown) => {
    if (method === 'session/new') {
      return Promise.resolve({ sessionId: 'session-1' }).then((value) => ({
        ...sessionConfigurationResponse(version),
        ...(typeof value === 'object' && value !== null ? value : {}),
        sessionId: 'session-1',
      }))
    }
    if (method === 'session/load' || method === 'session/resume') {
      const response = dependencies.request
        ? dependencies.request(method, params)
        : Promise.reject(new Error(`unexpected ACP request: ${method}`))
      return Promise.resolve(response).then((value) => ({
        ...sessionConfigurationResponse(version),
        ...(typeof value === 'object' && value !== null ? value : {}),
      }))
    }
    if (dependencies.request) return dependencies.request(method, params)
    if (method === 'session/prompt')
      return version === 1 ? prompt.promise : Promise.resolve({} satisfies acpV2.PromptResponse)
    if (method === 'session/close') return Promise.resolve({})
    return Promise.reject(new Error(`unexpected ACP request: ${method}`))
  })
  const notify = vi.fn(async () => undefined)
  const protocolClose = vi.fn()
  const protocol = {
    wireVersion: version,
    initialization: {
      protocolVersion: version,
      supportsLoadSession: false,
      supportsResumeSession: version === 2,
      ...dependencies.initialization,
    },
    connection: {} as never,
    context: { request, notify } as never,
    closed: new Promise<void>(() => undefined),
    close: protocolClose,
  } as AcpProtocolConnection
  const processClose = vi.fn(async () => undefined)
  const process = {
    definition,
    artifact,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    started: Promise.resolve(),
    closed: new Promise(() => undefined),
    diagnostics: () => '',
    close: processClose,
  } satisfies AcpProcess
  const connection = new AcpAgentConnection(process, protocol)
  let registeredHandlers: AcpProtocolHandlers | undefined
  const connect = vi.fn(async (_definition, _options, handlers, _requiredWireVersion) => {
    registeredHandlers = handlers
    return connection
  })
  const factory: AcpConnectionFactoryPort = {
    connect,
  }
  const runtime = new AcpConversationRuntime(
    definition,
    '/workspace',
    factory,
    dependencies.broker,
    dependencies.attachmentFactory,
    dependencies.runtimeOptions,
  )
  return {
    runtime,
    connect,
    prompt,
    request,
    notify,
    protocolClose,
    processClose,
    handlers() {
      if (!registeredHandlers) throw new Error('ACP handlers were not registered')
      return registeredHandlers
    },
  }
}

function sessionConfigurationResponse(version: 1 | 2) {
  return version === 1
    ? {
        modes: {
          currentModeId: 'default',
          availableModes: [
            { id: 'plan', name: 'Plan' },
            { id: 'default', name: 'Default' },
            { id: 'bypassPermissions', name: 'Full access' },
          ],
        },
        configOptions: v1ConfigOptions('default', 'default'),
      }
    : { configOptions: v2ConfigOptions('default', 'default') }
}

function v1ConfigOptions(model: string, mode: string) {
  return configOptions('id', model, mode)
}

function v2ConfigOptions(model: string, mode: string) {
  return configOptions('configId', model, mode)
}

function configOptions(idKey: 'id' | 'configId', model: string, mode: string) {
  return [
    {
      [idKey]: 'model',
      name: 'Model',
      category: 'model',
      type: 'select',
      currentValue: model,
      options: [
        { value: 'default', name: 'Default' },
        { value: 'sonnet', name: 'Sonnet' },
      ],
    },
    {
      [idKey]: 'mode',
      name: 'Mode',
      category: 'mode',
      type: 'select',
      currentValue: mode,
      options: [
        { value: 'plan', name: 'Plan' },
        { value: 'default', name: 'Default' },
        { value: 'bypassPermissions', name: 'Full access' },
      ],
    },
  ]
}

async function waitForRequest(request: ReturnType<typeof vi.fn>, method: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (request.mock.calls.some((call) => call[0] === method)) return
    await Promise.resolve()
  }
  throw new Error(`ACP request was not observed: ${method}`)
}

function manualScheduler() {
  let callback: (() => void) | undefined
  return {
    setTimeout: vi.fn((next: () => void) => {
      callback = next
      return 1
    }),
    clearTimeout: vi.fn(),
    fire() {
      const current = callback
      callback = undefined
      if (!current) throw new Error('subject timer is not pending')
      current()
    },
  }
}

function conversationBinding(
  version: 1 | 2,
  nativeSessionId = 'session-restored',
  hostTools: HostToolDefinition[] = [],
) {
  return createAcpConversationBinding(
    {
      definition: officialAcpAgentDefinitions()[0],
      workspacePath: '/workspace',
      hostTools,
    },
    nativeSessionId,
    version,
  )
}

function createHostToolsDependencies(version: 1 | 2, ready: Promise<void> = Promise.resolve()) {
  const created = deferred<void>()
  const closed = deferred<void>()
  let definitions = [structuredClone(HOST_TOOL)]
  const scope: ConversationToolScope = {
    conversationId: 'conversation-1',
    revision: 1,
    definitions: () => structuredClone(definitions),
    call: vi.fn(),
  }
  const broker: AcpConversationToolBrokerPort = {
    configureConversation: vi.fn((_conversationId, nextDefinitions) => {
      definitions = structuredClone(nextDefinitions)
    }),
    openScope: vi.fn(() => scope),
    removeConversation: vi.fn(),
  }
  const attachment: AcpMcpAttachmentOwner = {
    ready,
    closed: closed.promise,
    close: vi.fn(async () => closed.resolve(undefined)),
  }
  const configuration = createAcpMcpServerConfiguration(
    version,
    { command: '/electron', relayEntrypoint: '/dist-electron/mcp-process.js' },
    '/private/attachment.json',
  )
  const attachmentFactory: AcpMcpAttachmentFactoryPort = {
    create: vi.fn(async () => {
      created.resolve(undefined)
      return { attachment, configuration }
    }),
  }
  return { broker, scope, attachment, attachmentFactory, configuration, created, closed }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function terminal(event: ConversationEvent): boolean {
  return event.event.type === 'runFinished' || event.event.type === 'runFailed'
}
