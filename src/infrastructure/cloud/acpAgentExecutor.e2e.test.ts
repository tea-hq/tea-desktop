import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AcpAgentExecutor,
  acpProviderEnvironment,
  resolveAcpExecutable,
} from '../../../packages/runner/src/acp'

describe('AcpAgentExecutor', () => {
  it('resolves npm dependency binaries outside the current working directory', () => {
    expect(resolveAcpExecutable('claude-agent-acp')).toMatch(
      /node_modules[\\/]\.bin[\\/]claude-agent-acp$/,
    )
    expect(resolveAcpExecutable('/usr/bin/node')).toBe('/usr/bin/node')
  })

  it('runs an ACP agent over stdio and returns its structured output', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-acp-'))
    const fixture = path.resolve('electron/conversation/acp/fixtures/v1Agent.mjs')
    const executor = new AcpAgentExecutor({
      agents: [{ runtimeId: 'acp.fixture', executable: process.execPath, arguments: [fixture] }],
      requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
    })
    const command = {
      command: 'conversation.start' as const,
      conversationId: 'conversation-acp-e2e',
      runtimeId: 'acp.fixture',
      providerId: 'fixture',
      modelId: 'fixture-model',
      workspaceRef: 'workspace-acp-e2e',
      workspacePath: workspace,
    }

    try {
      await executor.start(command)
      const streamed: string[] = []
      const event = await executor.prompt(
        { ...command, command: 'conversation.prompt', text: 'hello' },
        (value) => {
          if (value.eventType === 'acp.session.update') streamed.push(value.eventType)
        },
      )
      expect(event).toMatchObject({
        eventType: 'assistant.message',
        terminal: true,
        data: { text: 'fixture response' },
      })
      expect((event.data as { stopReason: string }).stopReason).toBe('cancelled')
      expect(streamed).toEqual(['acp.session.update'])
      await executor.cancel({ ...command, command: 'conversation.cancel' })
    } finally {
      await executor.shutdown()
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('maps a Center provider lease into Claude ACP environment variables', () => {
    const environment = acpProviderEnvironment(
      { runtimeId: 'external.claude', executable: 'claude-agent-acp' },
      {
        command: 'conversation.start',
        conversationId: 'conversation-provider-env',
        runtimeId: 'external.claude',
        providerId: 'tokbox',
        modelId: 'gpt-5.6-luna',
        workspaceRef: 'workspace-provider-env',
        workspacePath: os.tmpdir(),
        provider: {
          providerId: 'tokbox',
          kind: 'openai_compatible',
          displayName: 'Tokbox',
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-secret',
          modelId: 'gpt-5.6-luna',
          modelIds: ['gpt-5.6-luna'],
        },
      },
    )
    expect(environment).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://models.example.test/v1',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_BEDROCK_BASE_URL: '',
      ANTHROPIC_VERTEX_BASE_URL: '',
      ANTHROPIC_AUTH_TOKEN: 'acp-proxy',
      ANTHROPIC_CUSTOM_HEADERS: 'x-api-key: provider-secret',
      ANTHROPIC_CUSTOM_MODEL_OPTION: 'gpt-5.6-luna',
      CLAUDE_CODE_OAUTH_TOKEN: '',
      CLAUDE_CODE_USE_BEDROCK: '0',
      CLAUDE_CODE_USE_VERTEX: '0',
    })
    expect(environment.CLAUDE_MODEL_CONFIG).toContain('gpt-5.6-luna')
  })

  it('starts the shipped Claude ACP agent with a leased provider configuration', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-claude-lease-'))
    const executor = new AcpAgentExecutor({
      agents: [
        {
          runtimeId: 'external.claude',
          executable: 'claude-agent-acp',
          modelConfigId: 'model',
          modeConfigId: 'mode',
        },
      ],
    })
    try {
      await executor.start({
        command: 'conversation.start',
        conversationId: 'conversation-claude-lease',
        runtimeId: 'external.claude',
        providerId: 'tokbox',
        modelId: 'gpt-5.6-luna',
        workspaceRef: 'workspace-claude-lease',
        workspacePath: workspace,
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
    } finally {
      await executor.shutdown()
      await rm(workspace, { recursive: true, force: true })
    }
  }, 15_000)

  it('rejects unsupported runtimes before starting a process', async () => {
    const executor = new AcpAgentExecutor({
      agents: [{ runtimeId: 'acp.fixture', executable: process.execPath }],
    })
    await expect(
      executor.start({
        command: 'conversation.start',
        conversationId: 'conversation-missing',
        runtimeId: 'acp.missing',
        providerId: 'fixture',
        modelId: 'fixture-model',
        workspaceRef: 'workspace-missing',
        workspacePath: os.tmpdir(),
      }),
    ).rejects.toThrow('unsupported ACP runtime')
    await executor.shutdown()
  })
})
