import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'

import { TeaRunner } from '../../packages/runner/src/runner'
import {
  RUNNER_PROTOCOL_VERSION,
  type CloudConversation,
  type CloudConversationEvent,
  type RunnerEnvelope,
  type RunnerEvent,
  type RunnerAttached,
} from '../../packages/runner/src/protocol'
import { TeaCenterCloudRunnerClient } from '../../src/infrastructure/cloud/cloudRunnerClient'
import { CloudConversationCommandService } from './cloudCommandService'
import type { RuntimeConversationCommandService } from './commandService'

describe('cloud runner desktop path', () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
  })

  it('runs create, prompt, runner execution, and desktop event projection end to end', async () => {
    let runnerSocket: WebSocket | null = null
    let registered: RunnerAttached | null = null
    let resolveRegistered!: () => void
    const registeredPromise = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    let resolveTerminal!: () => void
    const terminalPromise = new Promise<void>((resolve) => {
      resolveTerminal = resolve
    })
    let resolveStarted!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    const conversation = cloudConversation()
    const events: CloudConversationEvent[] = []
    const httpServer = createServer(
      (request, response) =>
        void handleHttp(request, response, conversation, events, () => {
          if (!runnerSocket || !registered) throw new Error('runner is not connected')
          const command = request.url?.includes('/messages')
            ? 'conversation.prompt'
            : 'conversation.start'
          const envelope: RunnerEnvelope = {
            version: RUNNER_PROTOCOL_VERSION,
            messageId: randomUUID(),
            type: 'runner.command',
            runnerId: registered.runnerId,
            instanceId: registered.instanceId,
            conversationId: conversation.conversationId,
            assignmentEpoch: registered.epoch,
            payload: {
              command,
              runtimeId: conversation.runtimeId,
              providerId: conversation.providerId,
              modelId: conversation.modelId,
              workspaceRef: conversation.workspaceRef,
              ...(command === 'conversation.prompt' ? { text: 'hello' } : {}),
            },
          }
          runnerSocket.send(JSON.stringify(envelope))
        }),
    )
    const webSockets = new WebSocketServer({ noServer: true })
    httpServer.on('upgrade', (request, socket, head) => {
      webSockets.handleUpgrade(request, socket, head, (connection) => {
        webSockets.emit('connection', connection, request)
      })
    })
    webSockets.on('connection', (socket) => {
      runnerSocket = socket
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type === 'runner.attach') {
          const request = message.payload as {
            localKey: string
            tags: string[]
            workspaceRoot: string
            limit?: number
          }
          registered = {
            runnerId: 'runner-e2e',
            localKey: request.localKey,
            attachmentId: 'instance-e2e',
            instanceId: 'instance-e2e',
            tags: request.tags,
            workspaceRoot: request.workspaceRoot,
            limit: request.limit ?? 5,
            epoch: 1,
          }
          socket.send(
            JSON.stringify({
              version: RUNNER_PROTOCOL_VERSION,
              messageId: randomUUID(),
              type: 'runner.attached',
              runnerId: registered.runnerId,
              localKey: registered.localKey,
              instanceId: registered.instanceId,
              attachmentId: registered.attachmentId,
              assignmentEpoch: registered.epoch,
              payload: registered,
            } satisfies RunnerEnvelope<RunnerAttached>),
          )
          resolveRegistered()
          return
        }
        if (message.type !== 'runner.event') return
        const event = message.payload as RunnerEvent
        events.push({
          conversationId: conversation.conversationId,
          sequence: events.length + 1,
          type: event.eventType,
          data: event.data,
          terminal: event.terminal,
          errorCode: event.errorCode,
          error: event.error,
          createdAt: new Date().toISOString(),
        })
        if (event.eventType === 'conversation.started') resolveStarted()
        if (event.eventType === 'assistant.message') resolveTerminal()
      })
    })
    await listen(httpServer)
    const address = httpServer.address()
    if (!address || typeof address === 'string') throw new Error('test server has no address')

    const runnerStateDir = `/tmp/tea-runner-cloud-e2e-state-${randomUUID()}`
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: '/tmp/tea-runner-e2e',
        stateDir: runnerStateDir,
        runners: [
          {
            localKey: 'runner-e2e',
            token: 'runner-secret',
            displayName: 'Runner E2E',
            tags: ['linux'],
          },
        ],
      },
      {
        executor: {
          start: async () => undefined,
          prompt: async (_command, emit): Promise<RunnerEvent> => {
            await emit?.({
              eventType: 'acp.session.update',
              data: {
                sessionId: 'session-e2e',
                update: {
                  sessionUpdate: 'agent_thought_chunk',
                  messageId: 'thought-e2e',
                  content: { type: 'text', text: 'Inspecting the request.' },
                },
              },
            })
            await emit?.({
              eventType: 'acp.session.update',
              data: {
                sessionId: 'session-e2e',
                update: {
                  sessionUpdate: 'tool_call',
                  toolCallId: 'tool-e2e',
                  title: 'Read files',
                  status: 'pending',
                  rawInput: { path: 'src' },
                },
              },
            })
            await emit?.({
              eventType: 'acp.session.update',
              data: {
                sessionId: 'session-e2e',
                update: {
                  sessionUpdate: 'tool_call_update',
                  toolCallId: 'tool-e2e',
                  title: 'Reading files',
                  status: 'in_progress',
                },
              },
            })
            await emit?.({
              eventType: 'acp.session.update',
              data: {
                sessionId: 'session-e2e',
                update: {
                  sessionUpdate: 'tool_call_update',
                  toolCallId: 'tool-e2e',
                  status: 'completed',
                  content: [{ type: 'content', content: { type: 'text', text: '2 files' } }],
                },
              },
            })
            await emit?.({
              eventType: 'acp.session.update',
              data: {
                sessionId: 'session-e2e',
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: 'The project is ready.' },
                },
              },
            })
            return {
              eventType: 'assistant.message',
              data: { text: 'The project is ready.' },
              terminal: true,
            }
          },
          cancel: async () => undefined,
        },
      },
    )
    cleanups.push(async () => {
      await runner.stop()
      await rm(runnerStateDir, { recursive: true, force: true })
      webSockets.close()
      await close(httpServer)
    })
    await runner.start()
    await registeredPromise

    const client = new TeaCenterCloudRunnerClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      accessToken: () => 'desktop-access-token',
    })
    const projected: string[] = []
    const service = new CloudConversationCommandService(
      fakeLocal(),
      client,
      {
        conversationEvent: (event) => projected.push(event.event.type),
        conversationUpdated: () => undefined,
      },
      60_000,
    )
    cleanups.push(async () => service.dispose())

    const created = await service.createConversation({
      runtimeId: conversation.runtimeId,
      idempotencyKey: 'create-e2e',
      hostTools: [],
      executionTarget: 'cloud',
      providerId: conversation.providerId,
      modelId: conversation.modelId,
      runnerTags: ['linux'],
    })
    await startedPromise
    await service.sendMessage(created.handle.conversationId, 'hello', {
      model: 'default',
      permissionMode: 'default',
    })
    await terminalPromise
    await service.pollConversationNow(created.handle.conversationId)

    expect(events.map((event) => event.type)).toEqual([
      'conversation.started',
      'user.prompt',
      'acp.session.update',
      'acp.session.update',
      'acp.session.update',
      'acp.session.update',
      'acp.session.update',
      'assistant.message',
    ])
    expect(projected).toEqual([
      'runStarted',
      'thoughtDelta',
      'toolRequested',
      'toolProgress',
      'toolCompleted',
      'messageDelta',
      'messageDelta',
    ])
    expect(events.at(-1)?.terminal).toBe(true)
  })
})

function cloudConversation(): CloudConversation {
  return {
    conversationId: 'cloud-e2e',
    ownerSubjectId: 'user-e2e',
    tenantId: 'tenant-e2e',
    executionTarget: 'cloud',
    tags: ['linux'],
    runtimeId: 'acp.echo',
    providerId: 'test',
    modelId: 'echo',
    status: 'starting',
    workspaceRef: 'workspace-e2e',
    assignmentEpoch: 1,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }
}

async function handleHttp(
  request: IncomingMessage,
  response: ServerResponse,
  conversation: CloudConversation,
  events: CloudConversationEvent[],
  dispatch: () => void,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/v1/cloud/runner-tags')
    return json(response, [{ tag: 'linux', available: 1, busy: 0, scope: 'tenant' }])
  if (url.pathname === '/v1/cloud/conversations' && request.method === 'GET')
    return json(response, [conversation])
  if (url.pathname === '/v1/cloud/conversations' && request.method === 'POST') {
    conversation.status = 'starting'
    dispatch()
    return json(response, conversation, 201)
  }
  if (
    url.pathname === `/v1/cloud/conversations/${conversation.conversationId}` &&
    request.method === 'GET'
  )
    return json(response, conversation)
  if (url.pathname === `/v1/cloud/conversations/${conversation.conversationId}/events`) {
    const after = Number(url.searchParams.get('after') ?? '0')
    return json(
      response,
      events.filter((event) => event.sequence > after),
    )
  }
  if (
    url.pathname === `/v1/cloud/conversations/${conversation.conversationId}/messages` &&
    request.method === 'POST'
  ) {
    const body = await readBody(request)
    const parsed = JSON.parse(body) as { text?: string }
    events.push({
      conversationId: conversation.conversationId,
      sequence: events.length + 1,
      type: 'user.prompt',
      data: { text: parsed.text ?? '' },
      createdAt: new Date().toISOString(),
    })
    dispatch()
    response.writeHead(202)
    response.end()
    return
  }
  response.writeHead(404)
  response.end()
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  const encoded = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(encoded)
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => (value += chunk))
    request.on('end', () => resolve(value))
    request.on('error', reject)
  })
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

function fakeLocal(): RuntimeConversationCommandService {
  return {
    listRuntimes: async () => [],
    listConversations: async () => ({ items: [], nextCursor: null, hasMore: false }),
  } as unknown as RuntimeConversationCommandService
}
