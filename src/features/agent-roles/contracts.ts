export type AgentRoleVisibility = 'tenant' | 'restricted' | 'private'
export type AgentRoleStatus = 'draft' | 'published' | 'archived'
export type CapabilityKind = 'skill' | 'mcp' | 'tool' | 'pluginAction'

export interface CapabilityReference {
  kind: CapabilityKind
  id: string
  version?: string
  available?: boolean
}

export type AgentRoleDependency =
  | { kind: 'skill'; id: string; version?: string }
  | {
      kind: 'pluginAction'
      pluginId: string
      connectionId: string
      actionId: string
      version?: string
    }

export interface AgentRoleRecord {
  id: string
  name: string
  description: string
  runtimeId: string
  modelId?: string
  systemPrompt?: string
  userPromptTemplate?: string
  visibility?: AgentRoleVisibility
  audienceRefs?: string[]
  status?: AgentRoleStatus
  capabilities?: CapabilityReference[]
  dependencies?: AgentRoleDependency[]
  skills: string[]
  plugins: string[]
  revision: number
  enabled: boolean
}

export type AgentRoleDraft = Omit<AgentRoleRecord, 'id' | 'revision' | 'enabled'> & {
  id?: string
  revision?: number
  enabled?: boolean
}
