import { describe, expect, it } from 'vitest'

import type { HostToolDefinition } from '../../../src/features/conversation/contracts'
import { officialAcpAgentDefinitions } from './agentCatalog'
import {
  createAcpConversationBinding,
  validateAcpConversationBinding,
  type AcpBindingContext,
} from './binding'

const TOOL: HostToolDefinition = {
  name: 'tea.channel.history',
  version: '1',
  description: 'Load Channel history',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
}

describe('ACP conversation binding', () => {
  it('records only the exact non-secret runtime identity required for restore', () => {
    const context = bindingContext()
    const binding = createAcpConversationBinding(context, 'session-1', 1)

    expect(binding).toEqual({
      schemaVersion: 1,
      runtimeId: context.definition.runtimeId,
      nativeSessionId: 'session-1',
      implementation: { kind: 'acp', id: context.definition.id, revision: 1 },
      protocol: { name: 'acp', version: 1 },
      artifact: context.definition.artifact,
      workspacePath: '/workspace',
      hostTools: [{ name: TOOL.name, version: TOOL.version }],
    })
    expect(JSON.stringify(binding)).not.toMatch(/credential|endpoint|environment|transcript/i)
  })

  it.each([
    [
      'wire version',
      (value: Record<string, unknown>) => {
        const protocol = value.protocol as Record<string, unknown>
        protocol.version = 3
      },
    ],
    ['runtime id', (value: Record<string, unknown>) => (value.runtimeId = 'external.changed')],
    [
      'definition revision',
      (value: Record<string, unknown>) => {
        const implementation = value.implementation as Record<string, unknown>
        implementation.revision = 2
      },
    ],
    [
      'artifact version',
      (value: Record<string, unknown>) => {
        const artifact = value.artifact as Record<string, unknown>
        artifact.version = 'changed'
      },
    ],
    ['workspace', (value: Record<string, unknown>) => (value.workspacePath = '/other')],
    [
      'HostTool revision',
      (value: Record<string, unknown>) => {
        const tools = value.hostTools as Array<Record<string, unknown>>
        tools.at(0)!.version = '2'
      },
    ],
    ['unknown field', (value: Record<string, unknown>) => (value.unexpected = true)],
  ])('rejects a changed %s before restore', (_name, mutate) => {
    const context = bindingContext()
    const binding = structuredClone(createAcpConversationBinding(context, 'session-1', 1))
    mutate(binding as unknown as Record<string, unknown>)

    expect(() => validateAcpConversationBinding(binding, context)).toThrowError(
      expect.objectContaining({ code: 'invalidConfiguration' }),
    )
  })

  it('rejects malformed or missing native session identity', () => {
    const context = bindingContext()
    const binding = createAcpConversationBinding(context, 'session-1', 1)

    expect(() =>
      validateAcpConversationBinding({ ...binding, nativeSessionId: '' }, context),
    ).toThrow()
    expect(() =>
      validateAcpConversationBinding({ ...binding, nativeSessionId: 'bad\nsession' }, context),
    ).toThrow()
  })

  it('rejects a wire version removed from the active Agent definition', () => {
    const context = bindingContext()
    const binding = createAcpConversationBinding(context, 'session-1', 1)
    const changedContext: AcpBindingContext = {
      ...context,
      definition: { ...context.definition, preferredWireVersions: [2] },
    }

    expect(() => validateAcpConversationBinding(binding, changedContext)).toThrowError(
      expect.objectContaining({ code: 'invalidConfiguration' }),
    )
  })
})

function bindingContext(): AcpBindingContext {
  return {
    definition: officialAcpAgentDefinitions()[0],
    workspacePath: '/workspace',
    hostTools: [TOOL],
  }
}
