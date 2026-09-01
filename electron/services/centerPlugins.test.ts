import { describe, expect, it, vi } from 'vitest'

import { SIGNED_OUT_STATE, type CenterAuthState } from '../../src/features/auth/contracts'
import type { HostToolCall } from '../../src/features/conversation/contracts'
import { ElectronCenterPluginService } from './centerPlugins'

describe('ElectronCenterPluginService', () => {
  it('projects enabled operations and executes them through the authenticated Center client', async () => {
    const state = authenticatedState('tenant-a')
    const callPlugin = vi.fn(async () => ({
      requestId: 'request-1',
      pluginId: 'plugin-a',
      operationId: 'getIssue',
      statusCode: 200,
      contentType: 'application/json',
      body: { key: 'OMIM-1', title: 'Fix issue' },
    }))
    const client = {
      stateValue: () => state,
      listEnabledPlugins: vi.fn(async () => [pluginCatalog()]),
      callPlugin,
    }
    const service = new ElectronCenterPluginService(client)

    await service.synchronize()
    const definitions = await service.mandatoryDefinitions()

    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({
      version: '1',
      iconUrl:
        'https://yx-web-nosdn.netease.im/common/a1d7a178ca0d42d05d92555abbc628ea/overmind.png',
      inputSchema: {
        properties: { productId: { type: 'string', default: '263' }, jiraKey: { type: 'string' } },
      },
    })
    expect(definitions[0]!.name).toMatch(/^tea_plugin_Overmind_Query_issue_[a-f0-9]{16}$/)
    const call: HostToolCall = {
      conversationId: 'conversation-1',
      callId: 'call-1',
      name: definitions[0]!.name,
      arguments: { jiraKey: 'OMIM-1' },
    }
    const result = await service.execute(call, new AbortController().signal)

    expect(callPlugin).toHaveBeenCalledWith(
      'plugin-a',
      'getIssue',
      { jiraKey: 'OMIM-1' },
      'conversation-1',
      expect.any(AbortSignal),
    )
    expect(result).toEqual({
      conversationId: 'conversation-1',
      callId: 'call-1',
      status: 'success',
      output: {
        requestId: 'request-1',
        pluginId: 'plugin-a',
        operationId: 'getIssue',
        statusCode: 200,
        contentType: 'application/json',
        body: { key: 'OMIM-1', title: 'Fix issue' },
      },
    })
  })

  it('clears the previous tenant snapshot on logout and catalog failure', async () => {
    let state = authenticatedState('tenant-a')
    const listEnabledPlugins = vi.fn(async () => [pluginCatalog()])
    const client = {
      stateValue: () => state,
      listEnabledPlugins,
      callPlugin: vi.fn(),
    }
    const service = new ElectronCenterPluginService(client)
    await service.synchronize()
    expect(await service.mandatoryDefinitions()).toHaveLength(1)

    state = structuredClone(SIGNED_OUT_STATE)
    await service.synchronize(state)
    expect(await service.mandatoryDefinitions()).toEqual([])

    state = authenticatedState('tenant-b')
    listEnabledPlugins.mockRejectedValueOnce(new Error('Center unavailable'))
    await expect(service.synchronize(state)).rejects.toThrow('Center unavailable')
    expect(await service.mandatoryDefinitions()).toEqual([])
  })

  it('accepts operations that omit the optional parameters field', async () => {
    const client = {
      stateValue: () => authenticatedState('tenant-a'),
      listEnabledPlugins: vi.fn(async () => [
        {
          pluginId: 'plugin-a',
          displayName: 'Overmind',
          description: 'Work item platform',
          enabled: true,
          operations: [
            {
              id: 'createComment',
              name: 'Create comment',
              description: 'Create one issue comment',
              method: 'POST',
              path: '/api/issue-comment',
            },
          ],
        },
      ]),
      callPlugin: vi.fn(),
    }
    const service = new ElectronCenterPluginService(client)

    await service.synchronize()

    expect(await service.mandatoryDefinitions()).toMatchObject([
      {
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
      },
    ])
  })

  it('preserves prototype-sensitive parameter names without mutating the schema object', async () => {
    const catalog = pluginCatalog()
    catalog.operations[0]!.parameters = [
      { name: '__proto__', in: 'query', required: true, schema: { type: 'string' } },
    ]
    const client = {
      stateValue: () => authenticatedState('tenant-a'),
      listEnabledPlugins: vi.fn(async () => [catalog]),
      callPlugin: vi.fn(),
    }
    const service = new ElectronCenterPluginService(client)

    await service.synchronize()

    const [definition] = await service.mandatoryDefinitions()
    const properties = definition!.inputSchema.properties as Record<string, unknown>
    expect(Object.hasOwn(properties, '__proto__')).toBe(true)
    expect(properties['__proto__']).toEqual({ type: 'string' })
    expect(properties.polluted).toBeUndefined()
  })
})

function authenticatedState(tenantId: string): CenterAuthState {
  return {
    ...structuredClone(SIGNED_OUT_STATE),
    phase: 'authenticated',
    bootstrap: {
      schemaVersion: 1,
      revision: 1,
      generatedAt: '2026-09-01T00:00:00Z',
      tenant: { id: tenantId, domain: 'example.com', displayName: 'Example' },
      user: {
        id: 'user-1',
        displayName: 'Ada',
        preferredUsername: 'ada',
        email: 'ada@example.com',
        emailVerified: true,
        avatarUrl: '',
        oidcSubject: 'subject-1',
      },
      im: null,
      modelProviders: [],
    },
  }
}

function pluginCatalog() {
  return {
    pluginId: 'plugin-a',
    displayName: 'Overmind',
    description: 'Work item platform',
    iconUrl: 'https://yx-web-nosdn.netease.im/common/a1d7a178ca0d42d05d92555abbc628ea/overmind.png',
    enabled: true,
    operations: [
      {
        id: 'getIssue',
        name: 'Query issue',
        description: 'Query one issue',
        method: 'GET',
        path: '/api/issue',
        parameters: [
          {
            name: 'productId',
            in: 'query',
            required: false,
            schema: { type: 'string', default: '263' },
          },
          { name: 'jiraKey', in: 'query', required: true, schema: { type: 'string' } },
        ],
      },
    ],
  }
}
