import type { RuntimeDescriptor } from '../../src/features/conversation/contracts'
import { ConversationRuntimeError, type ConversationRuntime } from './runtime'

export class ConversationRuntimeRegistry {
  private readonly runtimes = new Map<string, ConversationRuntime>()
  private shutdownPromise: Promise<void> | null = null

  constructor(runtimes: Iterable<ConversationRuntime> = []) {
    for (const runtime of runtimes) this.register(runtime)
  }

  descriptors(): RuntimeDescriptor[] {
    this.assertActive()
    return this.sortedEntries().map(([, runtime]) => structuredClone(runtime.descriptor()))
  }

  require(runtimeId: string): ConversationRuntime {
    this.assertActive()
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime) {
      throw new ConversationRuntimeError(
        'unknownRuntime',
        `runtime is not registered: ${runtimeId}`,
      )
    }
    return runtime
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownAll()
    return this.shutdownPromise
  }

  private register(runtime: ConversationRuntime): void {
    const descriptor = runtime.descriptor()
    if (!descriptor.id.trim()) {
      throw new ConversationRuntimeError('invalidConfiguration', 'runtime id must not be empty')
    }
    if (this.runtimes.has(descriptor.id)) {
      throw new ConversationRuntimeError(
        'duplicateRuntimeId',
        `runtime id is registered more than once: ${descriptor.id}`,
      )
    }
    this.runtimes.set(descriptor.id, runtime)
  }

  private async shutdownAll(): Promise<void> {
    const failures: unknown[] = []
    for (const [, runtime] of this.sortedEntries()) {
      try {
        await runtime.shutdown()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'conversation runtime shutdown failed')
  }

  private sortedEntries(): Array<[string, ConversationRuntime]> {
    return [...this.runtimes.entries()].sort(([left], [right]) => left.localeCompare(right))
  }

  private assertActive(): void {
    if (this.shutdownPromise) {
      throw new ConversationRuntimeError('shutDown', 'conversation runtime registry has shut down')
    }
  }
}
