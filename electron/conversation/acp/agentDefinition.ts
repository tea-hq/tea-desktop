import type { AcpDependency } from './dependencyVersions'
import type { PermissionMode } from '../../../src/features/conversation/contracts'

export type AcpWireVersion = 1 | 2

export interface AcpSessionConfigurationDefinition {
  modelConfigId: string
  modeConfigId: string
  defaultModelId?: string
  permissionModeIds: Record<PermissionMode, string>
}

export interface AcpAgentDefinition {
  id: string
  revision: number
  runtimeId: string
  displayName: string
  artifact: AcpDependency
  entrypoint: string
  arguments: readonly string[]
  preferredWireVersions: readonly AcpWireVersion[]
  sessionConfiguration: AcpSessionConfigurationDefinition
}

export interface ResolvedAcpAgentArtifact {
  definition: AcpAgentDefinition
  packageRoot: string
  packageJsonPath: string
  entrypointPath: string
}
