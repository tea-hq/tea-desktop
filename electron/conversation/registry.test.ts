import { describe, expect, it, vi } from 'vitest'

import type { AcpAgentDefinition } from './acp/agentDefinition'
import { AcpHostError } from './acp/errors'
import { createAcpRuntimeRegistry } from './registry'

describe('createAcpRuntimeRegistry', () => {
  it('registers the pinned Claude and Codex runtimes only after artifact verification', async () => {
    const resolve = vi.fn(async (definition: AcpAgentDefinition) => ({
      definition,
      packageRoot: '/package',
      packageJsonPath: '/package/package.json',
      entrypointPath: '/package/dist/index.js',
    }))
    const registry = await createAcpRuntimeRegistry('/workspace', broker(), {
      artifactResolver: { resolve },
    })

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(registry.descriptors()).toEqual([
      expect.objectContaining({
        id: 'external.claude',
        status: 'ready',
        capabilities: expect.arrayContaining(['history', 'hostTools', 'snapshot']),
      }),
      expect.objectContaining({
        id: 'external.codex',
        status: 'ready',
        capabilities: expect.arrayContaining(['history', 'hostTools', 'snapshot']),
      }),
    ])
    await registry.shutdown()
  })

  it('does not publish a partial registry when one pinned artifact is invalid', async () => {
    const resolve = vi.fn(async (definition: { id: string }) => {
      if (definition.id === 'codex.acp') {
        throw new AcpHostError('artifactInvalid', 'invalid Codex artifact')
      }
      return {} as never
    })

    await expect(
      createAcpRuntimeRegistry('/workspace', broker(), { artifactResolver: { resolve } }),
    ).rejects.toMatchObject({ code: 'artifactInvalid' })
  })
})

function broker() {
  return {
    configureConversation: vi.fn(),
    openScope: vi.fn(),
    removeConversation: vi.fn(),
  }
}
