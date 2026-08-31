import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { officialAcpAgentDefinitions } from './agentCatalog'
import type { ResolvedAcpAgentArtifact } from './agentDefinition'
import {
  AcpAgentConnection,
  AcpConnectionFactory,
  OfficialAcpProtocolDriver,
  normalizeAcpRecoveryCapabilities,
  type AcpProtocolConnection,
  withInitializationTimeout,
} from './connection'
import { AcpHostError } from './errors'
import { AcpProcessLauncher, type AcpProcess } from './process'

describe('AcpConnectionFactory', () => {
  it('uses a fresh Agent process when V2 falls back to V1', async () => {
    const definition = officialAcpAgentDefinitions()[0]
    const artifact = resolvedArtifact()
    const processes = [fakeProcess(artifact), fakeProcess(artifact)]
    const launcher = { launch: vi.fn(() => processes.shift()!) }
    const protocol = fakeProtocol(1)
    const driver = {
      connect: vi.fn(async (_process: AcpProcess, version: 1 | 2) => {
        if (version === 2) {
          throw new AcpHostError('protocolVersionUnsupported', 'V2 is not supported')
        }
        return protocol
      }),
    }
    const first = processes[0]
    const second = processes[1]
    const factory = new AcpConnectionFactory(
      { resolve: vi.fn(async () => artifact) },
      launcher,
      driver,
    )

    const connection = await factory.connect(definition, { cwd: '/workspace' })

    expect(launcher.launch).toHaveBeenCalledTimes(2)
    expect(first.close).toHaveBeenCalledOnce()
    expect(driver.connect.mock.calls.map((call) => call[1])).toEqual([2, 1])
    expect(connection.process).toBe(second)
  })

  it('does not disguise a process or transport failure as version negotiation', async () => {
    const artifact = resolvedArtifact()
    const process = fakeProcess(artifact)
    const factory = new AcpConnectionFactory(
      { resolve: vi.fn(async () => artifact) },
      { launch: vi.fn(() => process) },
      {
        connect: vi.fn(async () => {
          throw new AcpHostError('connectionFailed', 'transport failed', true)
        }),
      },
    )

    await expect(factory.connect(artifact.definition, { cwd: '/workspace' })).rejects.toMatchObject(
      { code: 'connectionFailed' },
    )
    expect(process.close).toHaveBeenCalledOnce()
  })

  it('falls back when the official V2 decoder sees a V1 initialize response shape', async () => {
    const artifact = resolvedArtifact()
    const processes = [fakeProcess(artifact), fakeProcess(artifact)]
    const launcher = { launch: vi.fn(() => processes.shift()!) }
    const protocol = fakeProtocol(1)
    const v1ShapeDecodeError = Object.assign(new Error('V2 response did not decode'), {
      issues: [{ code: 'invalid_type', expected: 'object', path: ['info'] }],
    })
    const driver = {
      connect: vi.fn(async (_process: AcpProcess, version: 1 | 2) => {
        if (version === 2) throw v1ShapeDecodeError
        return protocol
      }),
    }
    const connection = await new AcpConnectionFactory(
      { resolve: vi.fn(async () => artifact) },
      launcher,
      driver,
    ).connect(artifact.definition, { cwd: '/workspace' })

    expect(launcher.launch).toHaveBeenCalledTimes(2)
    expect(processes).toHaveLength(0)
    expect(connection.protocol.wireVersion).toBe(1)
  })

  it('retries a V1-only Agent fixture through a fresh official SDK connection', async () => {
    const artifact = resolvedArtifact()
    artifact.entrypointPath = fileURLToPath(new URL('./fixtures/v1Agent.mjs', import.meta.url))

    const connection = await new AcpConnectionFactory(
      { resolve: vi.fn(async () => artifact) },
      new AcpProcessLauncher(undefined, process.execPath),
      new OfficialAcpProtocolDriver(),
    ).connect(artifact.definition, { cwd: process.cwd() })

    expect(connection.protocol.wireVersion).toBe(1)
    expect(connection.protocol.initialization.protocolVersion).toBe(1)
    await connection.close()
  })

  it('uses only the recorded wire version during recovery', async () => {
    const artifact = resolvedArtifact()
    const process = fakeProcess(artifact)
    const driver = {
      connect: vi.fn(async (_process: AcpProcess, _version: 1 | 2) => {
        throw new AcpHostError('protocolVersionUnsupported', 'V2 is not supported')
      }),
    }
    const factory = new AcpConnectionFactory(
      { resolve: vi.fn(async () => artifact) },
      { launch: vi.fn(() => process) },
      driver,
    )

    await expect(
      factory.connect(artifact.definition, { cwd: '/workspace' }, undefined, 2),
    ).rejects.toMatchObject({ code: 'protocolVersionUnsupported' })

    expect(driver.connect).toHaveBeenCalledOnce()
    expect(driver.connect.mock.calls[0][1]).toBe(2)
  })

  it('normalizes official load and resume recovery capabilities', () => {
    expect(
      normalizeAcpRecoveryCapabilities(1, {
        loadSession: true,
        sessionCapabilities: { resume: {}, delete: {}, close: {} },
      }),
    ).toEqual({
      supportsLoadSession: true,
      supportsResumeSession: true,
      supportsDeleteSession: true,
      supportsCloseSession: true,
    })
    expect(normalizeAcpRecoveryCapabilities(1, {})).toEqual({
      supportsLoadSession: false,
      supportsResumeSession: false,
      supportsDeleteSession: false,
      supportsCloseSession: false,
    })
    expect(normalizeAcpRecoveryCapabilities(2, { session: {} })).toEqual({
      supportsLoadSession: false,
      supportsResumeSession: true,
      supportsDeleteSession: false,
      supportsCloseSession: true,
    })
    expect(normalizeAcpRecoveryCapabilities(2, { session: { delete: {} } })).toEqual({
      supportsLoadSession: false,
      supportsResumeSession: true,
      supportsDeleteSession: true,
      supportsCloseSession: true,
    })
    expect(normalizeAcpRecoveryCapabilities(2, {})).toEqual({
      supportsLoadSession: false,
      supportsResumeSession: false,
      supportsDeleteSession: false,
      supportsCloseSession: false,
    })
  })

  it('closes protocol and process idempotently', async () => {
    const artifact = resolvedArtifact()
    const process = fakeProcess(artifact)
    const protocol = fakeProtocol(1)
    const connection = new AcpAgentConnection(process, protocol)

    await connection.close()
    await connection.close()

    expect(protocol.close).toHaveBeenCalledOnce()
    expect(process.close).toHaveBeenCalledOnce()
  })

  it('initializes a V1 Agent over the official stdio NDJSON stream', async () => {
    const artifact = resolvedArtifact()
    artifact.entrypointPath = fileURLToPath(new URL('./fixtures/v1Agent.mjs', import.meta.url))
    const agentProcess = new AcpProcessLauncher(undefined, process.execPath).launch(artifact, {
      cwd: process.cwd(),
    })
    await agentProcess.started

    const updates: string[] = []
    const permissionOptions: string[] = []
    const protocol = await new OfficialAcpProtocolDriver().connect(
      agentProcess,
      1,
      {
        name: 'tea-desktop-test',
        version: '0.1.0',
      },
      {
        sessionUpdate: (input) => {
          if (input.wireVersion !== 1) return
          const { notification } = input
          if (
            notification.update.sessionUpdate === 'agent_message_chunk' &&
            typeof notification.update.content === 'object' &&
            notification.update.content !== null &&
            'type' in notification.update.content &&
            notification.update.content.type === 'text' &&
            'text' in notification.update.content &&
            typeof notification.update.content.text === 'string'
          ) {
            updates.push(notification.update.content.text)
          }
        },
        requestPermission: ({ request }) => {
          permissionOptions.push(...request.options.map((option) => option.optionId))
          return { outcome: { outcome: 'selected', optionId: request.options[0].optionId } }
        },
      },
    )

    expect(protocol.initialization).toMatchObject({
      protocolVersion: 1,
      agentInfo: { name: 'tea-test-agent', version: '1.0.0' },
      supportsLoadSession: false,
      supportsResumeSession: false,
    })
    if (protocol.wireVersion !== 1) throw new Error('expected a V1 ACP connection')
    const session = await protocol.context.request('session/new', {
      cwd: process.cwd(),
      mcpServers: [],
    })
    const prompt = await protocol.context.request('session/prompt', {
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'hello' }],
    })
    expect(prompt.stopReason).toBe('end_turn')
    expect(updates).toEqual(['fixture response'])
    expect(permissionOptions).toEqual(['fixture-allow'])
    protocol.close()
    await agentProcess.close()
  })

  it('bounds initialization without relying on a real sleep', async () => {
    vi.useFakeTimers()
    try {
      const result = withInitializationTimeout(new Promise(() => undefined), 'agent.test', 1_000)
      const rejection = expect(result).rejects.toMatchObject({
        code: 'initializationTimeout',
        retryable: true,
      })
      await vi.advanceTimersByTimeAsync(1_000)

      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})

function resolvedArtifact(): ResolvedAcpAgentArtifact {
  return {
    definition: officialAcpAgentDefinitions()[0],
    packageRoot: '/package',
    packageJsonPath: '/package/package.json',
    entrypointPath: '/package/dist/index.js',
  }
}

function fakeProcess(artifact: ResolvedAcpAgentArtifact): AcpProcess {
  return {
    definition: artifact.definition,
    artifact,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    started: Promise.resolve(),
    closed: new Promise(() => undefined),
    diagnostics: () => '',
    close: vi.fn(async () => undefined),
  }
}

function fakeProtocol(version: 1 | 2): AcpProtocolConnection {
  const capabilities = {
    supportsLoadSession: false,
    supportsResumeSession: false,
    supportsDeleteSession: false,
    supportsCloseSession: false,
  }
  const shared = {
    connection: {} as never,
    context: {} as never,
    closed: new Promise<void>(() => undefined),
    close: vi.fn(),
  }
  if (version === 1) {
    return {
      wireVersion: 1,
      initialization: { protocolVersion: 1, ...capabilities },
      ...shared,
    }
  }
  return {
    wireVersion: 2,
    initialization: {
      protocolVersion: 2,
      ...capabilities,
    },
    ...shared,
  }
}
