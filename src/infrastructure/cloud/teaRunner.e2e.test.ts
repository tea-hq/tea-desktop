import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { describe, expect, it } from 'vitest'
import { TeaRunner } from '../../../packages/runner/src/runner'
import { AcpAgentExecutor } from '../../../packages/runner/src/acp'
import {
  RUNNER_PROTOCOL_VERSION,
  type RunnerEnvelope,
  type RunnerAttached,
} from '../../../packages/runner/src/protocol'

describe('TeaRunner WebSocket execution', () => {
  it('multiplexes multiple logical runners over one WebSocket connection', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server has no address')
    let connectionCount = 0
    const attached: string[] = []
    server.on('connection', (socket) => {
      connectionCount += 1
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type !== 'runner.attach') return
        const request = message.payload as {
          localKey: string
          tags: string[]
          workspaceRoot: string
          limit?: number
        }
        attached.push(request.localKey)
        const instanceId = `instance-${request.localKey}`
        socket.send(
          JSON.stringify({
            version: RUNNER_PROTOCOL_VERSION,
            messageId: randomUUID(),
            correlationId: message.messageId,
            type: 'runner.attached',
            runnerId: `server-${request.localKey}`,
            localKey: request.localKey,
            instanceId,
            attachmentId: instanceId,
            assignmentEpoch: 1,
            payload: {
              runnerId: `server-${request.localKey}`,
              localKey: request.localKey,
              instanceId,
              attachmentId: instanceId,
              tags: request.tags,
              workspaceRoot: request.workspaceRoot,
              limit: request.limit ?? 5,
              epoch: 1,
            },
          }),
        )
      })
    })
    let resolveRegistered!: () => void
    const allRegistered = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: path.join(os.tmpdir(), 'tea-runner-multiplex'),
        stateDir: path.join(os.tmpdir(), `tea-runner-multiplex-state-${randomUUID()}`),
        runners: [
          {
            localKey: 'tenant-runner',
            token: 'tenant-token',
            displayName: 'Tenant',
            tags: ['linux'],
          },
          { localKey: 'user-runner', token: 'user-token', displayName: 'User', tags: ['gpu'] },
        ],
      },
      {
        onRegistered: () => {
          if (runner.getRegistrations().length === 2) resolveRegistered()
        },
      },
    )
    try {
      await runner.start()
      await allRegistered
      expect(connectionCount).toBe(1)
      expect(attached.sort()).toEqual(['tenant-runner', 'user-runner'])
      expect(
        runner
          .getRegistrations()
          .map((value) => value.localKey)
          .sort(),
      ).toEqual(['tenant-runner', 'user-runner'])
    } finally {
      await runner.stop()
      server.close()
    }
  })

  it('registers, creates a workspace, and returns a terminal event', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('test WebSocket server has no address')
    const events: RunnerEnvelope[] = []
    let client: WebSocket | null = null
    let registered!: RunnerAttached
    let resolveRegistered!: () => void
    const registration = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    let resolveEvent!: () => void
    const eventReceived = new Promise<void>((resolve) => {
      resolveEvent = resolve
    })
    server.on('connection', (socket) => {
      client = socket
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
              assignmentEpoch: 1,
              payload: registered,
            }),
          )
          resolveRegistered()
        } else if (message.type === 'runner.event') {
          events.push(message)
          if (events.length >= 2) resolveEvent()
        }
      })
    })
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: path.join(os.tmpdir(), 'tea-runner-e2e'),
        stateDir: path.join(os.tmpdir(), `tea-runner-e2e-state-${randomUUID()}`),
        runners: [{ localKey: 'runner-e2e', token: 'secret', displayName: 'E2E', tags: ['linux'] }],
      },
      { heartbeatIntervalMs: 60_000 },
    )
    await runner.start()
    await registration
    const connection = client as WebSocket | null
    if (!connection) throw new Error('runner did not connect')
    const command = (
      command: 'conversation.start' | 'conversation.prompt',
      text?: string,
    ): RunnerEnvelope => ({
      version: RUNNER_PROTOCOL_VERSION,
      messageId: randomUUID(),
      type: 'runner.command',
      runnerId: registered.runnerId,
      instanceId: registered.instanceId,
      conversationId: 'conversation-e2e',
      assignmentEpoch: 1,
      payload: {
        command,
        runtimeId: 'acp.echo',
        providerId: 'test',
        modelId: 'echo',
        text,
        workspaceRef: 'workspace-e2e',
      },
    })
    connection.send(JSON.stringify(command('conversation.start')))
    connection.send(JSON.stringify(command('conversation.prompt', 'hello')))
    await eventReceived
    expect(
      events.some(
        (event) => (event.payload as { eventType?: string }).eventType === 'conversation.started',
      ),
    ).toBe(true)
    expect(
      events.some(
        (event) => (event.payload as { eventType?: string }).eventType === 'assistant.message',
      ),
    ).toBe(true)
    await runner.stop()
    server.close()
  })

  it('serializes commands and executes a real ACP agent through the runner socket', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('test WebSocket server has no address')
    const fixture = path.resolve('electron/conversation/acp/fixtures/v1Agent.mjs')
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-e2e-'))
    const events: RunnerEnvelope[] = []
    let client: WebSocket | null = null
    let resolveRegistered!: () => void
    const registered = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    let resolveEvents!: () => void
    const receivedEvents = new Promise<void>((resolve) => {
      resolveEvents = resolve
    })
    server.on('connection', (socket) => {
      client = socket
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type === 'runner.attach') {
          socket.send(
            JSON.stringify({
              version: RUNNER_PROTOCOL_VERSION,
              messageId: randomUUID(),
              type: 'runner.attached',
              localKey: 'runner-acp-e2e',
              runnerId: 'runner-acp-e2e',
              instanceId: 'instance-acp-e2e',
              attachmentId: 'instance-acp-e2e',
              payload: {
                runnerId: 'runner-acp-e2e',
                localKey: 'runner-acp-e2e',
                attachmentId: 'instance-acp-e2e',
                instanceId: 'instance-acp-e2e',
                tags: ['linux'],
                workspaceRoot,
                limit: 5,
                epoch: 1,
              } satisfies RunnerAttached,
            }),
          )
          resolveRegistered()
        } else if (message.type === 'runner.event') {
          events.push(message)
          if ((message.payload as { eventType?: string }).eventType === 'permission.requested') {
            const data = (message.payload as { data?: { approvalId?: string } }).data
            socket.send(
              JSON.stringify({
                version: RUNNER_PROTOCOL_VERSION,
                messageId: randomUUID(),
                type: 'runner.command',
                runnerId: 'runner-acp-e2e',
                instanceId: 'instance-acp-e2e',
                conversationId: 'conversation-acp-e2e',
                assignmentEpoch: 1,
                payload: {
                  command: 'conversation.permission.resolve',
                  runtimeId: 'acp.fixture',
                  providerId: 'fixture',
                  modelId: 'fixture-model',
                  workspaceRef: 'workspace-acp-e2e',
                  approvalId: data?.approvalId,
                  decision: 'allowOnce',
                },
              }),
            )
          }
          if ((message.payload as { eventType?: string }).eventType === 'assistant.message')
            resolveEvents()
        }
      })
    })
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot,
        stateDir: path.join(os.tmpdir(), `tea-runner-acp-state-${randomUUID()}`),
        runners: [
          {
            localKey: 'runner-acp-e2e',
            token: 'secret',
            displayName: 'ACP E2E',
            tags: ['linux'],
          },
        ],
      },
      {
        heartbeatIntervalMs: 60_000,
        executor: new AcpAgentExecutor({
          agents: [
            { runtimeId: 'acp.fixture', executable: process.execPath, arguments: [fixture] },
          ],
        }),
      },
    )
    try {
      await runner.start()
      await registered
      const connection = client as WebSocket | null
      if (!connection) throw new Error('runner did not connect')
      const envelope = (command: 'conversation.start' | 'conversation.prompt', text?: string) =>
        JSON.stringify({
          version: RUNNER_PROTOCOL_VERSION,
          messageId: randomUUID(),
          type: 'runner.command',
          conversationId: 'conversation-acp-e2e',
          assignmentEpoch: 1,
          payload: {
            command,
            runtimeId: 'acp.fixture',
            providerId: 'fixture',
            modelId: 'fixture-model',
            workspaceRef: 'workspace-acp-e2e',
            ...(text === undefined ? {} : { text }),
          },
        } satisfies RunnerEnvelope)
      connection.send(envelope('conversation.start'))
      connection.send(envelope('conversation.prompt', 'hello'))
      await receivedEvents
      expect(events.map((event) => (event.payload as { eventType?: string }).eventType)).toEqual([
        'conversation.started',
        'acp.session.update',
        'permission.requested',
        'assistant.message',
      ])
      expect((events[3].payload as { data?: { text?: string } }).data?.text).toBe(
        'fixture response',
      )
    } finally {
      await runner.stop({ force: true })
      server.close()
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('does not execute a queued prompt when a provider lease is missing', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('test WebSocket server has no address')
    const events: RunnerEnvelope[] = []
    let client: WebSocket | null = null
    let resolveRegistered!: () => void
    const registered = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    let resolveFailure!: () => void
    const failure = new Promise<void>((resolve) => {
      resolveFailure = resolve
    })
    server.on('connection', (socket) => {
      client = socket
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type === 'runner.attach') {
          socket.send(
            JSON.stringify({
              version: RUNNER_PROTOCOL_VERSION,
              messageId: randomUUID(),
              correlationId: message.messageId,
              type: 'runner.attached',
              localKey: 'runner-start-failure',
              runnerId: 'runner-start-failure',
              instanceId: 'instance-start-failure',
              attachmentId: 'instance-start-failure',
              payload: {
                runnerId: 'runner-start-failure',
                localKey: 'runner-start-failure',
                attachmentId: 'instance-start-failure',
                instanceId: 'instance-start-failure',
                tags: ['linux'],
                workspaceRoot: path.join(os.tmpdir(), 'tea-runner-start-failure'),
                limit: 5,
                epoch: 1,
              } satisfies RunnerAttached,
            }),
          )
          resolveRegistered()
          return
        }
        if (message.type !== 'runner.event') return
        events.push(message)
        if ((message.payload as { eventType?: string }).eventType === 'conversation.failed')
          resolveFailure()
      })
    })
    let promptCalls = 0
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: path.join(os.tmpdir(), 'tea-runner-start-failure'),
        stateDir: path.join(os.tmpdir(), `tea-runner-start-failure-state-${randomUUID()}`),
        runners: [
          {
            localKey: 'runner-start-failure',
            token: 'secret',
            displayName: 'Start failure',
            tags: ['linux'],
          },
        ],
      },
      {
        heartbeatIntervalMs: 60_000,
        executor: {
          start: async () => undefined,
          prompt: async () => {
            promptCalls += 1
            return { eventType: 'assistant.message', terminal: true }
          },
          cancel: async () => undefined,
        },
      },
    )
    try {
      await runner.start()
      await registered
      const connection = client as WebSocket | null
      if (!connection) throw new Error('runner did not connect')
      const command = (
        messageId: string,
        value: 'conversation.start' | 'conversation.prompt',
        text?: string,
      ) =>
        JSON.stringify({
          version: RUNNER_PROTOCOL_VERSION,
          messageId,
          type: 'runner.command',
          runnerId: 'runner-start-failure',
          instanceId: 'instance-start-failure',
          conversationId: 'conversation-start-failure',
          assignmentEpoch: 1,
          payload: {
            command: value,
            runtimeId: 'external.claude',
            providerId: 'tokbox',
            modelId: 'gpt-5.6-luna',
            workspaceRef: 'workspace-start-failure',
            ...(text === undefined ? {} : { text }),
          },
        } satisfies RunnerEnvelope)
      connection.send(command('start-failure', 'conversation.start'))
      connection.send(command('prompt-after-start-failure', 'conversation.prompt', 'hello'))
      await failure
      await runner.stop({ force: true })
      expect(promptCalls).toBe(0)
      expect(
        events.filter(
          (event) => (event.payload as { eventType?: string }).eventType === 'conversation.failed',
        ),
      ).toHaveLength(1)
      expect(
        (
          events.find(
            (event) =>
              (event.payload as { eventType?: string }).eventType === 'conversation.failed',
          )?.payload as { error?: string }
        ).error,
      ).toBe('provider lease is missing for the selected model')
    } finally {
      await runner.stop({ force: true })
      server.close()
    }
  })

  it('fetches a provider lease before starting an ACP executor without serializing credentials', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server has no address')
    let client: WebSocket | null = null
    let resolveRegistered!: () => void
    const registered = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let startedCommand: { provider?: { apiKey?: string; baseUrl?: string } } | undefined
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
    server.on('connection', (socket) => {
      client = socket
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type === 'runner.attach') {
          socket.send(
            JSON.stringify({
              version: RUNNER_PROTOCOL_VERSION,
              messageId: randomUUID(),
              correlationId: message.messageId,
              type: 'runner.attached',
              runnerId: 'runner-provider-lease',
              localKey: 'runner-provider-lease',
              instanceId: 'instance-provider-lease',
              attachmentId: 'instance-provider-lease',
              assignmentEpoch: 1,
              payload: {
                runnerId: 'runner-provider-lease',
                localKey: 'runner-provider-lease',
                attachmentId: 'instance-provider-lease',
                instanceId: 'instance-provider-lease',
                tags: ['linux'],
                workspaceRoot: path.join(os.tmpdir(), 'tea-runner-provider-lease'),
                limit: 5,
                epoch: 1,
              } satisfies RunnerAttached,
            }),
          )
          resolveRegistered()
          return
        }
        if (
          message.type === 'runner.event' &&
          (message.payload as { eventType?: string }).eventType === 'conversation.started'
        ) {
          resolveStarted()
        }
      })
    })
    const executor = {
      start: async (command: { provider?: { apiKey?: string; baseUrl?: string } }) => {
        startedCommand = command
      },
      prompt: async () => ({ eventType: 'assistant.message', terminal: true }),
      cancel: async () => undefined,
    }
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: path.join(os.tmpdir(), `tea-runner-provider-lease-${randomUUID()}`),
        stateDir: path.join(os.tmpdir(), `tea-runner-provider-lease-state-${randomUUID()}`),
        runners: [
          {
            localKey: 'runner-provider-lease',
            token: 'runner-secret',
            displayName: 'Lease',
            tags: ['linux'],
          },
        ],
      },
      {
        heartbeatIntervalMs: 60_000,
        executor,
        fetch: async (url, init) => {
          fetchCalls.push({ url: String(url), init })
          return {
            ok: true,
            status: 200,
            json: async () => ({
              providerId: 'tokbox',
              kind: 'openai_compatible',
              displayName: 'Tokbox',
              baseUrl: 'https://models.example.test/v1',
              apiKey: 'provider-secret',
              modelId: 'gpt-5.6-luna',
              modelIds: ['gpt-5.6-luna'],
            }),
          } as Response
        },
      },
    )
    try {
      await runner.start()
      await registered
      const connection = client as WebSocket | null
      if (!connection) throw new Error('runner did not connect')
      connection.send(
        JSON.stringify({
          version: RUNNER_PROTOCOL_VERSION,
          messageId: randomUUID(),
          type: 'runner.command',
          runnerId: 'runner-provider-lease',
          localKey: 'runner-provider-lease',
          instanceId: 'instance-provider-lease',
          conversationId: 'conversation-provider-lease',
          assignmentEpoch: 1,
          payload: {
            command: 'conversation.start',
            runtimeId: 'external.claude',
            providerId: 'tokbox',
            modelId: 'gpt-5.6-luna',
            workspaceRef: 'workspace-provider-lease',
            leaseToken: 'lease-secret',
          },
        } satisfies RunnerEnvelope),
      )
      await started
      expect(startedCommand?.provider).toEqual({
        providerId: 'tokbox',
        kind: 'openai_compatible',
        displayName: 'Tokbox',
        baseUrl: 'https://models.example.test/v1',
        apiKey: 'provider-secret',
        modelId: 'gpt-5.6-luna',
        modelIds: ['gpt-5.6-luna'],
      })
      expect(fetchCalls).toHaveLength(1)
      expect(fetchCalls[0]?.url).toBe(`http://127.0.0.1:${address.port}/v1/runner/provider-lease`)
      expect(fetchCalls[0]?.init?.headers).toEqual({
        Authorization: 'Bearer runner-secret',
        'Content-Type': 'application/json',
      })
      expect(String(fetchCalls[0]?.init?.body)).toContain('lease-secret')
      expect(String(fetchCalls[0]?.init?.body)).not.toContain('provider-secret')
    } finally {
      await runner.stop({ force: true })
      server.close()
    }
  })

  it('rebinds spooled ACP events to the new assignment epoch after reconnect', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server has no address')
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-reconnect-state-'))
    let connectionCount = 0
    let client: WebSocket | null = null
    const events: RunnerEnvelope[] = []
    let releasePrompt!: () => void
    const promptReleased = new Promise<void>((resolve) => {
      releasePrompt = resolve
    })
    let resolveReplayed!: () => void
    const replayed = new Promise<void>((resolve) => {
      resolveReplayed = resolve
    })
    server.on('connection', (socket) => {
      connectionCount += 1
      const epoch = connectionCount
      if (epoch === 1) client = socket
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type === 'runner.attach') {
          socket.send(
            JSON.stringify({
              version: RUNNER_PROTOCOL_VERSION,
              messageId: randomUUID(),
              type: 'runner.attached',
              localKey: 'runner-reconnect',
              runnerId: 'runner-reconnect',
              instanceId: `instance-${epoch}`,
              attachmentId: `instance-${epoch}`,
              payload: {
                runnerId: 'runner-reconnect',
                localKey: 'runner-reconnect',
                attachmentId: `instance-${epoch}`,
                instanceId: `instance-${epoch}`,
                tags: ['linux'],
                workspaceRoot: path.join(os.tmpdir(), 'tea-runner-reconnect'),
                limit: 5,
                epoch,
              } satisfies RunnerAttached,
            }),
          )
          return
        }
        if (message.type !== 'runner.event') return
        events.push(message)
        const eventType = (message.payload as { eventType?: string }).eventType
        if (epoch === 1 && eventType === 'conversation.started') {
          socket.close()
          releasePrompt()
        }
        if (epoch === 2 && eventType === 'assistant.message') resolveReplayed()
      })
    })
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: path.join(os.tmpdir(), 'tea-runner-reconnect'),
        stateDir,
        runners: [
          {
            localKey: 'runner-reconnect',
            token: 'secret',
            displayName: 'Reconnect',
            tags: ['linux'],
          },
        ],
      },
      {
        reconnectDelayMs: 10,
        heartbeatIntervalMs: 60_000,
        executor: {
          start: async () => undefined,
          prompt: async () => {
            await promptReleased
            return {
              eventType: 'assistant.message',
              data: { text: 'offline result' },
              terminal: true,
            }
          },
          cancel: async () => undefined,
        },
      },
    )
    try {
      await runner.start()
      const connection = client as WebSocket | null
      if (!connection) throw new Error('runner did not connect')
      const command = (
        messageId: string,
        command: 'conversation.start' | 'conversation.prompt',
        text?: string,
      ) =>
        JSON.stringify({
          version: RUNNER_PROTOCOL_VERSION,
          messageId,
          type: 'runner.command',
          runnerId: 'runner-reconnect',
          instanceId: 'instance-1',
          conversationId: 'conversation-reconnect',
          assignmentEpoch: 1,
          payload: {
            command,
            runtimeId: 'acp.echo',
            providerId: 'test',
            modelId: 'echo',
            workspaceRef: 'workspace-reconnect',
            ...(text === undefined ? {} : { text }),
          },
        } satisfies RunnerEnvelope)
      connection.send(command('start-reconnect', 'conversation.start'))
      connection.send(command('prompt-reconnect', 'conversation.prompt', 'finish while offline'))
      await replayed
      const assistant = events.find(
        (event) =>
          event.type === 'runner.event' &&
          (event.payload as { eventType?: string }).eventType === 'assistant.message',
      )
      expect(assistant?.assignmentEpoch).toBe(2)
      expect(assistant?.instanceId).toBe('instance-2')
      expect((assistant?.payload as { data?: { text?: string } }).data?.text).toBe('offline result')
    } finally {
      await runner.stop({ force: true })
      server.close()
      await rm(stateDir, { recursive: true, force: true })
    }
  })

  it('deduplicates command message ids and rejects stale assignments', async () => {
    const server = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server has no address')
    let client: WebSocket | null = null
    let resolveRegistered!: () => void
    const registered = new Promise<void>((resolve) => {
      resolveRegistered = resolve
    })
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let resolveRejected!: () => void
    const rejected = new Promise<void>((resolve) => {
      resolveRejected = resolve
    })
    const events: RunnerEnvelope[] = []
    server.on('connection', (socket) => {
      client = socket
      socket.on('message', (encoded) => {
        const message = JSON.parse(encoded.toString()) as RunnerEnvelope
        if (message.type === 'runner.attach') {
          socket.send(
            JSON.stringify({
              version: RUNNER_PROTOCOL_VERSION,
              messageId: randomUUID(),
              type: 'runner.attached',
              localKey: 'runner-dedupe',
              runnerId: 'runner-dedupe',
              instanceId: 'instance-dedupe',
              attachmentId: 'instance-dedupe',
              payload: {
                runnerId: 'runner-dedupe',
                localKey: 'runner-dedupe',
                attachmentId: 'instance-dedupe',
                instanceId: 'instance-dedupe',
                tags: ['linux'],
                workspaceRoot: path.join(os.tmpdir(), 'tea-runner-dedupe'),
                limit: 5,
                epoch: 3,
              } satisfies RunnerAttached,
            }),
          )
          resolveRegistered()
        } else if (message.type === 'runner.event' || message.type === 'runner.error') {
          events.push(message)
          const eventType = (message.payload as { eventType?: string }).eventType
          if (eventType === 'conversation.started') resolveStarted()
          if (message.type === 'runner.error') resolveRejected()
        }
      })
    })
    let starts = 0
    const runner = new TeaRunner(
      {
        centerUrl: `http://127.0.0.1:${address.port}`,
        workspaceRoot: path.join(os.tmpdir(), 'tea-runner-dedupe'),
        stateDir: path.join(os.tmpdir(), `tea-runner-dedupe-state-${randomUUID()}`),
        runners: [
          {
            localKey: 'runner-dedupe',
            token: 'secret',
            displayName: 'Dedupe',
            tags: ['linux'],
          },
        ],
      },
      {
        heartbeatIntervalMs: 60_000,
        executor: {
          start: async () => {
            starts += 1
          },
          prompt: async () => ({ eventType: 'assistant.message', terminal: true }),
          cancel: async () => undefined,
        },
      },
    )
    try {
      await runner.start()
      await registered
      const connection = client as WebSocket | null
      if (!connection) throw new Error('runner did not connect')
      const duplicate = JSON.stringify({
        version: RUNNER_PROTOCOL_VERSION,
        messageId: 'duplicate-command',
        type: 'runner.command',
        runnerId: 'runner-dedupe',
        instanceId: 'instance-dedupe',
        conversationId: 'conversation-dedupe',
        assignmentEpoch: 3,
        payload: {
          command: 'conversation.start',
          runtimeId: 'acp.fixture',
          providerId: 'fixture',
          modelId: 'fixture-model',
          workspaceRef: 'workspace-dedupe',
        },
      } satisfies RunnerEnvelope)
      connection.send(duplicate)
      connection.send(duplicate)
      await started
      expect(starts).toBe(1)

      connection.send(
        JSON.stringify({
          version: RUNNER_PROTOCOL_VERSION,
          messageId: 'stale-command',
          type: 'runner.command',
          runnerId: 'runner-dedupe',
          instanceId: 'instance-dedupe',
          conversationId: 'conversation-stale',
          assignmentEpoch: 2,
          payload: {
            command: 'conversation.start',
            runtimeId: 'acp.fixture',
            providerId: 'fixture',
            modelId: 'fixture-model',
            workspaceRef: 'workspace-stale',
          },
        } satisfies RunnerEnvelope),
      )
      await rejected
      expect(starts).toBe(1)
      expect(
        events.some(
          (event) =>
            event.type === 'runner.error' &&
            (event.payload as { code?: string }).code === 'stale_assignment',
        ),
      ).toBe(true)
    } finally {
      await runner.stop({ force: true })
      server.close()
    }
  })
})
