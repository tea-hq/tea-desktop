import { AcpAgentCatalog } from './acp/agentCatalog'
import type { AcpAgentDefinition } from './acp/agentDefinition'
import { AcpAgentArtifactResolver } from './acp/artifactResolver'
import { AcpConnectionFactory, type AcpArtifactResolverPort } from './acp/connection'
import {
  AcpMcpAttachmentFactory,
  type AcpMcpAttachmentFactoryPort,
} from './acp/mcpAttachmentFactory'
import {
  AcpConversationRuntime,
  type AcpConnectionFactoryPort,
  type AcpConversationToolBrokerPort,
} from './acp/runtime'
import { ConversationRuntimeRegistry } from './runtimeRegistry'

export interface AcpRuntimeRegistryOptions {
  definitions?: readonly AcpAgentDefinition[]
  artifactResolver?: AcpArtifactResolverPort
  connectionFactory?: AcpConnectionFactoryPort
  mcpAttachmentFactory?: AcpMcpAttachmentFactoryPort
}

export async function createAcpRuntimeRegistry(
  workspacePath: string,
  toolBroker: AcpConversationToolBrokerPort,
  options: AcpRuntimeRegistryOptions = {},
): Promise<ConversationRuntimeRegistry> {
  const definitions = new AcpAgentCatalog(options.definitions).list()
  const artifactResolver = options.artifactResolver ?? new AcpAgentArtifactResolver()

  // Registration is the compatibility gate: no ready descriptor exists until
  // every pinned Agent entrypoint has been resolved and verified.
  await Promise.all(definitions.map((definition) => artifactResolver.resolve(definition)))

  const connectionFactory = options.connectionFactory ?? new AcpConnectionFactory(artifactResolver)
  const mcpAttachmentFactory = options.mcpAttachmentFactory ?? new AcpMcpAttachmentFactory()
  return new ConversationRuntimeRegistry(
    definitions.map(
      (definition) =>
        new AcpConversationRuntime(
          definition,
          workspacePath,
          connectionFactory,
          toolBroker,
          mcpAttachmentFactory,
          { status: 'ready' },
        ),
    ),
  )
}
