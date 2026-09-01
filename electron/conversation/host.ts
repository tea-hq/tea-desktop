import type {
  ConversationEvent,
  ConversationSummary,
  HostToolCall,
  HostToolDefinition,
} from '../../src/features/conversation/contracts'
import { ConversationCatalog } from './catalog'
import { RuntimeConversationCommandService } from './commandService'
import { createAcpRuntimeRegistry, type AcpRuntimeRegistryOptions } from './registry'
import { ConversationRuntimeError } from './runtime'
import {
  RuntimeConversationService,
  type RuntimeConversationServiceEvents,
  type RuntimeModelProviderResolver,
  type RuntimeHostToolReference,
  type RuntimeHostToolResolver,
} from './service'
import { ConversationToolBroker, type ConversationHostToolHandler } from './toolBroker'

export interface MandatoryHostToolProvider {
  definitions(): Promise<HostToolDefinition[]>
}

export interface ElectronConversationHostEvents {
  conversationEvent(event: ConversationEvent): void
  conversationUpdated(summary: ConversationSummary): void
  hostToolCall(call: HostToolCall): void
}

export interface ElectronConversationHostOptions {
  catalogPath: string
  workspaceId: string
  workspacePath: string
  hostTools: readonly HostToolDefinition[]
  events: ElectronConversationHostEvents
  registry?: AcpRuntimeRegistryOptions
  modelProviderResolver?: RuntimeModelProviderResolver
  mandatoryHostTools?: MandatoryHostToolProvider
  mainHostToolHandler?: ConversationHostToolHandler
}

export class RuntimeHostToolCatalog implements RuntimeHostToolResolver {
  private readonly definitions = new Map<string, HostToolDefinition>()

  constructor(
    definitions: readonly HostToolDefinition[],
    private readonly mandatory?: MandatoryHostToolProvider,
  ) {
    for (const definition of definitions) {
      const key = hostToolKey(definition)
      if (this.definitions.has(key)) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          `duplicate main-owned HostTool definition: ${definition.name}@${definition.version}`,
        )
      }
      this.definitions.set(key, structuredClone(definition))
    }
  }

  async resolve(references: readonly RuntimeHostToolReference[]): Promise<HostToolDefinition[]> {
    const definitions = new Map(this.definitions)
    for (const definition of (await this.mandatory?.definitions()) ?? []) {
      const key = hostToolKey(definition)
      if (definitions.has(key)) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          `duplicate main-owned HostTool definition: ${definition.name}@${definition.version}`,
        )
      }
      definitions.set(key, structuredClone(definition))
    }
    return references.map((reference) => {
      const definition = definitions.get(hostToolKey(reference))
      if (!definition) {
        throw new ConversationRuntimeError(
          'notConfigured',
          `HostTool is not registered in Electron main: ${reference.name}@${reference.version}`,
        )
      }
      return structuredClone(definition)
    })
  }

  async mandatoryReferences(): Promise<RuntimeHostToolReference[]> {
    return ((await this.mandatory?.definitions()) ?? []).map(({ name, version }) => ({
      name,
      version,
    }))
  }
}

export class ElectronConversationHost {
  readonly commands: RuntimeConversationCommandService
  private shutdownPromise: Promise<void> | null = null

  constructor(
    private readonly service: RuntimeConversationService,
    private readonly toolBroker: ConversationToolBroker,
    workspaceId: string,
    hostTools: RuntimeHostToolCatalog,
  ) {
    this.commands = new RuntimeConversationCommandService(service, workspaceId, () =>
      hostTools.mandatoryReferences(),
    )
  }

  initialize(): Promise<void> {
    return this.service.initialize()
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownOnce()
    return this.shutdownPromise
  }

  private async shutdownOnce(): Promise<void> {
    const result = await Promise.allSettled([this.service.shutdown()])
    this.toolBroker.shutdown()
    if (result[0].status === 'rejected') throw result[0].reason
  }
}

export async function createElectronConversationHost(
  options: ElectronConversationHostOptions,
): Promise<ElectronConversationHost> {
  const toolBroker = new ConversationToolBroker((call) => options.events.hostToolCall(call), {
    mainHandler: options.mainHostToolHandler,
  })
  try {
    const runtimes = await createAcpRuntimeRegistry(
      options.workspacePath,
      toolBroker,
      options.registry,
    )
    const serviceEvents: RuntimeConversationServiceEvents = {
      conversationEvent: (event) => options.events.conversationEvent(event),
      conversationUpdated: (summary) => options.events.conversationUpdated(summary),
    }
    const hostTools = new RuntimeHostToolCatalog(options.hostTools, options.mandatoryHostTools)
    const service = new RuntimeConversationService(
      new ConversationCatalog(options.catalogPath),
      runtimes,
      hostTools,
      undefined,
      undefined,
      toolBroker,
      serviceEvents,
      options.modelProviderResolver,
    )
    return new ElectronConversationHost(service, toolBroker, options.workspaceId, hostTools)
  } catch (cause) {
    toolBroker.shutdown()
    throw cause
  }
}

function hostToolKey(value: RuntimeHostToolReference): string {
  return `${value.name}\u0000${value.version}`
}
