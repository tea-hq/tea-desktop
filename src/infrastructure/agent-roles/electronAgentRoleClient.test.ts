// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('../electronBridge', () => ({ invoke: invokeMock, hasElectronBridge: () => true }))

import { listAgentRoles, saveAgentRoleRevision } from './electronAgentRoleClient'

describe('electron agent role client', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    Object.defineProperty(window, 'teaDesktop', { configurable: true, value: {} })
  })

  it('sends capability references in the Electron main shape with a default version', async () => {
    invokeMock.mockResolvedValue(undefined)

    await saveAgentRoleRevision({
      roleId: 'role.writer',
      revision: 0,
      name: 'Writer',
      description: '',
      runtimeId: 'external.claude',
      prompt: 'Write clearly',
      capabilities: [
        { kind: 'skill', id: 'skill.copy' },
        { kind: 'mcp', id: 'mcp.docs', available: false },
        { kind: 'tool', id: 'tool.search' },
      ],
      dependencies: [{ kind: 'skill', id: 'skill.copy', version: '' }],
    })

    expect(invokeMock).toHaveBeenCalledWith('save_agent_role_revision', {
      revision: expect.objectContaining({
        capabilities: [
          { kind: 'skill', id: 'skill.copy', version: '0.0.0' },
          { kind: 'mcp', id: 'mcp.docs', version: '0.0.0' },
          { kind: 'tool', id: 'tool.search', version: '0.0.0' },
        ],
        dependencies: [{ kind: 'skill', id: 'skill.copy', version: '0.0.0' }],
      }),
    })
  })

  it('maps object-shaped Electron rejections to a stable client error', async () => {
    invokeMock.mockRejectedValue({ code: 'invalidRequest', message: 'invalid role revision' })

    await expect(
      saveAgentRoleRevision({
        roleId: 'role.writer',
        revision: 0,
        name: 'Writer',
        description: '',
        runtimeId: 'external.claude',
        prompt: '',
        capabilities: [],
        dependencies: [],
      }),
    ).rejects.toMatchObject({
      name: 'AgentRoleClientError',
      code: 'invalidRequest',
      message: 'Agent role payload was rejected',
    })
  })

  it('recognizes a command-not-found object from an older host runtime', async () => {
    invokeMock.mockRejectedValue({ kind: 'CommandNotFound' })

    await expect(
      saveAgentRoleRevision({
        roleId: 'role.writer',
        revision: 0,
        name: 'Writer',
        description: '',
        runtimeId: 'external.claude',
        prompt: '',
        capabilities: [],
        dependencies: [],
      }),
    ).rejects.toMatchObject({ code: 'commandUnavailable' })
  })

  it('keeps saved prompts and capability references when listing local roles', async () => {
    invokeMock.mockResolvedValue([
      {
        roleId: 'role.writer',
        revision: 1,
        name: 'Writer',
        description: 'Writes clearly',
        runtimeId: 'external.claude',
        modelId: 'model.default',
        systemPrompt: 'Be concise',
        userPromptTemplate: '{{input}}',
        dependencies: [{ kind: 'skill', id: 'skill.copy' }],
        capabilities: [{ kind: 'mcp', id: 'mcp.docs', version: '1.0.0' }],
      },
    ])

    await expect(listAgentRoles()).resolves.toEqual([
      expect.objectContaining({
        id: 'role.writer',
        modelId: 'model.default',
        systemPrompt: 'Be concise',
        userPromptTemplate: '{{input}}',
        capabilities: [{ kind: 'mcp', id: 'mcp.docs', version: '1.0.0' }],
      }),
    ])
  })
})
