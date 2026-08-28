import { describe, expect, it, vi } from 'vitest'

import type { ConversationRuntime } from './runtime'
import { ConversationRuntimeError } from './runtime'
import { ConversationRuntimeRegistry } from './runtimeRegistry'

describe('ConversationRuntimeRegistry', () => {
  it('rejects duplicate runtime ids at composition time', () => {
    expect(
      () => new ConversationRuntimeRegistry([runtime('external.same'), runtime('external.same')]),
    ).toThrowError(ConversationRuntimeError)
  })

  it('returns deterministic descriptors and rejects unknown ids', () => {
    const registry = new ConversationRuntimeRegistry([runtime('external.z'), runtime('external.a')])

    expect(registry.descriptors().map((descriptor) => descriptor.id)).toEqual([
      'external.a',
      'external.z',
    ])
    expect(() => registry.require('external.missing')).toThrowError(
      expect.objectContaining({ code: 'unknownRuntime' }),
    )
  })

  it('attempts every shutdown once and then rejects further access', async () => {
    const calls: string[] = []
    const first = runtime('external.a', async () => {
      calls.push('external.a')
      throw new Error('failed')
    })
    const second = runtime('external.b', async () => {
      calls.push('external.b')
    })
    const registry = new ConversationRuntimeRegistry([second, first])

    await expect(registry.shutdown()).rejects.toThrow('conversation runtime shutdown failed')
    await expect(registry.shutdown()).rejects.toThrow('conversation runtime shutdown failed')
    expect(calls).toEqual(['external.a', 'external.b'])
    expect(() => registry.descriptors()).toThrowError(expect.objectContaining({ code: 'shutDown' }))
  })
})

function runtime(id: string, shutdown: () => Promise<void> = vi.fn(async () => undefined)) {
  return {
    descriptor: () => ({
      id,
      kind: 'externalCli' as const,
      displayName: id,
      capabilities: [],
      status: 'unavailable' as const,
    }),
    createConversation: vi.fn(),
    restoreConversation: vi.fn(),
    closeConversation: vi.fn(),
    configureHostTools: vi.fn(),
    loadSnapshot: vi.fn(),
    loadHistory: vi.fn(),
    generateSubject: vi.fn(),
    sendMessage: vi.fn(),
    cancel: vi.fn(),
    resolveApproval: vi.fn(),
    subscribe: vi.fn(),
    shutdown,
  } satisfies ConversationRuntime
}
