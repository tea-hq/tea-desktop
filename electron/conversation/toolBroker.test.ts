import { describe, expect, it, vi } from 'vitest'

import type { HostToolCall, HostToolDefinition } from '../../src/features/conversation/contracts'
import {
  ConversationToolBroker,
  type ConversationToolBrokerOptions,
  type ConversationToolBrokerScheduler,
} from './toolBroker'

const TOOL: HostToolDefinition = {
  name: 'lookup_message',
  version: '1.0.0',
  description: 'Looks up one message.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { id: { type: 'string', minLength: 1 } },
    required: ['id'],
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { found: { type: 'boolean' } },
    required: ['found'],
  },
}

describe('ConversationToolBroker', () => {
  it('owns an immutable conversation scope and resolves a call exactly once', async () => {
    const harness = createHarness()
    harness.broker.configureConversation('conversation-1', [TOOL])
    const scope = harness.broker.openScope('conversation-1')
    const pending = scope.call('lookup_message', { id: 'message-1' })

    expect(scope.definitions()).toEqual([TOOL])
    expect(harness.calls).toEqual([
      {
        conversationId: 'conversation-1',
        callId: 'call-1',
        name: 'lookup_message',
        arguments: { id: 'message-1' },
      },
    ])
    harness.broker.resolve({
      conversationId: 'conversation-1',
      callId: 'call-1',
      status: 'success',
      output: { found: true },
    })

    await expect(pending).resolves.toEqual({
      conversationId: 'conversation-1',
      callId: 'call-1',
      status: 'success',
      output: { found: true },
    })
    expect(() =>
      harness.broker.resolve({
        conversationId: 'conversation-1',
        callId: 'call-1',
        status: 'success',
        output: { found: true },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
  })

  it('rejects malformed and oversized arguments before notifying an executor', async () => {
    const harness = createHarness({ maxJsonBytes: 512, maxJsonDepth: 8 })
    harness.broker.configureConversation('conversation-1', [TOOL])
    const scope = harness.broker.openScope('conversation-1')

    await expect(scope.call('lookup_message', { id: 1 })).resolves.toMatchObject({
      status: 'failure',
      code: 'invalidRequest',
    })
    await expect(scope.call('lookup_message', { id: 'x'.repeat(513) })).resolves.toMatchObject({
      status: 'failure',
      code: 'limitExceeded',
    })
    await expect(
      scope.call('lookup_message', {
        id: 'valid',
        nested: { one: { two: { three: { four: { five: { six: { seven: true } } } } } } },
      }),
    ).resolves.toMatchObject({ status: 'failure', code: 'limitExceeded' })
    expect(harness.calls).toEqual([])
  })

  it('bounds pending calls and completes timeout through the injected scheduler', async () => {
    const scheduler = new ManualScheduler()
    const harness = createHarness({ maxPendingCalls: 1, scheduler })
    harness.broker.configureConversation('conversation-1', [TOOL])
    const scope = harness.broker.openScope('conversation-1')
    const first = scope.call('lookup_message', { id: 'first' })

    await expect(scope.call('lookup_message', { id: 'second' })).resolves.toMatchObject({
      status: 'failure',
      code: 'limitExceeded',
    })
    scheduler.runAll()
    await expect(first).resolves.toMatchObject({ status: 'failure', code: 'timeout' })
    expect(harness.calls).toHaveLength(1)
  })

  it('cancels pending work on request abort and conversation reconfiguration', async () => {
    const harness = createHarness()
    harness.broker.configureConversation('conversation-1', [TOOL])
    const firstScope = harness.broker.openScope('conversation-1')
    const controller = new AbortController()
    const aborted = firstScope.call(
      'lookup_message',
      { id: 'first' },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(aborted).resolves.toMatchObject({ status: 'failure', code: 'cancelled' })

    const invalidated = firstScope.call('lookup_message', { id: 'second' })
    harness.broker.configureConversation('conversation-1', [])
    await expect(invalidated).resolves.toMatchObject({ status: 'failure', code: 'unavailable' })
    await expect(firstScope.call('lookup_message', { id: 'third' })).resolves.toMatchObject({
      status: 'failure',
      code: 'unavailable',
    })
    expect(harness.broker.openScope('conversation-1').definitions()).toEqual([])
  })

  it('rejects results from another conversation and invalid executor output', async () => {
    const harness = createHarness({ maxJsonBytes: 512 })
    harness.broker.configureConversation('conversation-1', [TOOL])
    harness.broker.configureConversation('conversation-2', [TOOL])
    const scope = harness.broker.openScope('conversation-1')
    const invalidSchema = scope.call('lookup_message', { id: 'first' })

    expect(() =>
      harness.broker.resolve({
        conversationId: 'conversation-2',
        callId: 'call-1',
        status: 'success',
        output: { found: true },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
    harness.broker.resolve({
      conversationId: 'conversation-1',
      callId: 'call-1',
      status: 'success',
      output: { found: 'yes' } as never,
    })
    await expect(invalidSchema).resolves.toMatchObject({
      status: 'failure',
      code: 'executionFailed',
    })

    const oversized = scope.call('lookup_message', { id: 'second' })
    harness.broker.resolve({
      conversationId: 'conversation-1',
      callId: 'call-2',
      status: 'success',
      output: { found: true, detail: 'x'.repeat(513) } as never,
    })
    await expect(oversized).resolves.toMatchObject({
      status: 'failure',
      code: 'limitExceeded',
    })
  })

  it('maps executor notification failure and shutdown to terminal failures', async () => {
    let emitCount = 0
    const emit = vi.fn(() => {
      if (emitCount++ === 0) throw new Error('renderer unavailable')
    })
    let nextId = 1
    const broker = new ConversationToolBroker(emit, {
      createCallId: () => `call-${nextId++}`,
    })
    broker.configureConversation('conversation-1', [TOOL])
    await expect(
      broker.openScope('conversation-1').call('lookup_message', { id: 'first' }),
    ).resolves.toMatchObject({ status: 'failure', code: 'executionFailed' })

    const pending = broker.openScope('conversation-1').call('lookup_message', { id: 'second' })
    broker.shutdown()
    await expect(pending).resolves.toMatchObject({ status: 'failure', code: 'cancelled' })
    expect(() => broker.openScope('conversation-1')).toThrowError(
      expect.objectContaining({ code: 'shutDown' }),
    )
  })

  it('validates definitions and generated call ids at the owner boundary', async () => {
    const broker = new ConversationToolBroker(vi.fn(), { createCallId: () => 'same-call' })
    expect(() => broker.configureConversation('conversation-1', [TOOL, TOOL])).toThrowError(
      expect.objectContaining({ code: 'invalidConfiguration' }),
    )
    broker.configureConversation('conversation-1', [TOOL])
    const scope = broker.openScope('conversation-1')
    const first = scope.call('lookup_message', { id: 'first' })

    await expect(scope.call('lookup_message', { id: 'second' })).rejects.toMatchObject({
      code: 'invalidState',
    })
    broker.cancelConversation('conversation-1')
    await expect(first).resolves.toMatchObject({ status: 'failure', code: 'cancelled' })
  })

  it('executes main-owned tools without renderer dispatch and aborts their work', async () => {
    let executionSignal: AbortSignal | undefined
    const handler = {
      handles: vi.fn((name: string) => name === TOOL.name),
      execute: vi.fn(
        (_call: HostToolCall, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            executionSignal = signal
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              {
                once: true,
              },
            )
          }),
      ),
    }
    const harness = createHarness({ mainHandler: handler })
    harness.broker.configureConversation('conversation-1', [TOOL])
    const controller = new AbortController()
    const pending = harness.broker
      .openScope('conversation-1')
      .call('lookup_message', { id: 'message-1' }, { signal: controller.signal })

    controller.abort()

    await expect(pending).resolves.toMatchObject({ status: 'failure', code: 'cancelled' })
    expect(executionSignal?.aborted).toBe(true)
    expect(harness.calls).toEqual([])
  })
})

function createHarness(options: ConversationToolBrokerOptions = {}) {
  const calls: HostToolCall[] = []
  let nextId = 1
  const broker = new ConversationToolBroker((call) => calls.push(call), {
    createCallId: () => `call-${nextId++}`,
    ...options,
  })
  return { broker, calls }
}

class ManualScheduler implements ConversationToolBrokerScheduler {
  private readonly callbacks = new Map<number, () => void>()
  private nextId = 1

  setTimeout(callback: () => void): number {
    const id = this.nextId++
    this.callbacks.set(id, callback)
    return id
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number)
  }

  runAll(): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) callback()
  }
}
