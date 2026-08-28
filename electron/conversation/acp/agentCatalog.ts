import { ACP_DEPENDENCIES } from './dependencyVersions'
import type { AcpAgentDefinition } from './agentDefinition'
import { AcpHostError } from './errors'

const OFFICIAL_AGENT_DEFINITIONS = [
  {
    id: 'claude.acp',
    revision: 1,
    runtimeId: 'external.claude',
    displayName: 'Claude Code',
    artifact: ACP_DEPENDENCIES.claudeAgent,
    entrypoint: 'dist/index.js',
    arguments: [],
    preferredWireVersions: [2, 1],
    sessionConfiguration: {
      modelConfigId: 'model',
      modeConfigId: 'mode',
      defaultModelId: 'default',
      permissionModeIds: {
        readOnly: 'plan',
        default: 'default',
        fullAccess: 'bypassPermissions',
      },
    },
  },
  {
    id: 'codex.acp',
    revision: 1,
    runtimeId: 'external.codex',
    displayName: 'Codex',
    artifact: ACP_DEPENDENCIES.codexAgent,
    entrypoint: 'dist/index.js',
    arguments: [],
    preferredWireVersions: [2, 1],
    sessionConfiguration: {
      modelConfigId: 'model',
      modeConfigId: 'mode',
      permissionModeIds: {
        readOnly: 'read-only',
        default: 'agent',
        fullAccess: 'agent-full-access',
      },
    },
  },
] as const satisfies readonly AcpAgentDefinition[]

export class AcpAgentCatalog {
  private readonly definitions = new Map<string, AcpAgentDefinition>()

  constructor(definitions: readonly AcpAgentDefinition[] = OFFICIAL_AGENT_DEFINITIONS) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) {
        throw new AcpHostError(
          'artifactInvalid',
          `duplicate ACP Agent definition: ${definition.id}`,
        )
      }
      this.definitions.set(definition.id, structuredClone(definition))
    }
  }

  list(): AcpAgentDefinition[] {
    return [...this.definitions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => structuredClone(definition))
  }

  require(id: string): AcpAgentDefinition {
    const definition = this.definitions.get(id)
    if (!definition) throw new AcpHostError('artifactMissing', `ACP Agent is not defined: ${id}`)
    return structuredClone(definition)
  }
}

export function officialAcpAgentDefinitions(): AcpAgentDefinition[] {
  return new AcpAgentCatalog().list()
}
