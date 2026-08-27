import { hasElectronBridge, invoke } from '../electronBridge'
import type { AgentRoleDependency, AgentRoleRecord } from '@/features/agent-roles/contracts'

interface AgentRoleRevisionDto {
  roleId: string
  revision: number
  name: string
  description: string
  runtimeId: string
  modelId?: string
  systemPrompt?: string
  userPromptTemplate?: string
  dependencies: Array<AgentRoleDependency & { version?: string }>
  capabilities?: AgentRoleRecord['capabilities']
}

interface AgentRoleDto {
  roleId: string
  name: string
  description: string
  tenantId: string
  ownerSubjectId: string
  runtimeId: string
  visibility?: AgentRoleRecord['visibility']
  status?: AgentRoleRecord['status']
  currentRevision: {
    revision: number
    runtimeId?: string
    modelId?: string
    systemPrompt?: string
    userPromptTemplate?: string
    capabilities?: AgentRoleRecord['capabilities']
    dependencies?: AgentRoleRevisionDto['dependencies']
  }
}

interface AgentRoleCacheState {
  status: 'ready' | 'stale' | 'error'
  roles?: AgentRoleDto[]
  errorCode?: string
}

export interface AgentRoleRevisionInput {
  roleId: string
  revision: number
  name: string
  description: string
  runtimeId: string
  modelId?: string
  prompt: string
  systemPrompt?: string
  userPromptTemplate?: string
  visibility?: string
  status?: string
  capabilities?: Array<Record<string, unknown>>
  dependencies: Array<Record<string, string>>
}

export type AgentRoleClientErrorCode = 'invalidRequest' | 'commandUnavailable' | 'transport'

export class AgentRoleClientError extends Error {
  constructor(
    public readonly code: AgentRoleClientErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AgentRoleClientError'
  }
}

export async function listAgentRoles(): Promise<AgentRoleRecord[]> {
  if (!hasElectronBridge()) return []
  try {
    const revisions = await invoke<AgentRoleRevisionDto[]>('list_agent_roles')
    return revisions.map(revision => ({
      id: revision.roleId,
      name: revision.name,
      description: revision.description,
      runtimeId: revision.runtimeId,
      modelId: revision.modelId,
      systemPrompt: revision.systemPrompt,
      userPromptTemplate: revision.userPromptTemplate,
      capabilities: revision.capabilities ?? [],
      dependencies: revision.dependencies,
      skills: revision.dependencies.filter(item => item.kind === 'skill').map(item => item.id),
      plugins: revision.dependencies.filter(item => item.kind === 'pluginAction').map(item => item.pluginId),
      revision: revision.revision,
      enabled: true,
    }))
  } catch (error) {
    throw mapAgentRoleError(error)
  }
}

export async function syncAgentRoles(tenantId: string, subjectId: string): Promise<AgentRoleRecord[]> {
  if (!hasElectronBridge()) return []
  try {
    const state = await invoke<AgentRoleCacheState>('sync_agent_roles', { request: { tenantId, subjectId } })
    return (state.roles ?? []).map(role => ({
      id: role.roleId,
      name: role.name,
      description: role.description,
      runtimeId: role.currentRevision.runtimeId ?? role.runtimeId,
      modelId: role.currentRevision.modelId,
      systemPrompt: role.currentRevision.systemPrompt,
      userPromptTemplate: role.currentRevision.userPromptTemplate,
      visibility: role.visibility,
      status: role.status,
      capabilities: role.currentRevision.capabilities ?? [],
      dependencies: role.currentRevision.dependencies ?? [],
      skills: (role.currentRevision.dependencies ?? []).filter(item => item.kind === 'skill').map(item => item.id),
      plugins: (role.currentRevision.dependencies ?? []).filter(item => item.kind === 'pluginAction').map(item => item.pluginId),
      revision: role.currentRevision.revision,
      enabled: state.status === 'ready',
    }))
  } catch (error) {
    throw mapAgentRoleError(error)
  }
}

export async function saveAgentRoleRevision(input: AgentRoleRevisionInput): Promise<void> {
  if (!hasElectronBridge()) return
  const revision = normalizeRevisionInput(input)
  try {
    await invoke('save_agent_role_revision', { revision })
  } catch (error) {
    throw mapAgentRoleError(error)
  }
}

function normalizeRevisionInput(input: AgentRoleRevisionInput): AgentRoleRevisionInput {
  return {
    ...input,
    dependencies: input.dependencies.map(normalizeDependency),
    capabilities: (input.capabilities ?? []).map(normalizeCapability),
  }
}

function normalizeDependency(value: Record<string, string>): Record<string, string> {
  if (value.kind === 'skill' && value.id) {
    return { kind: 'skill', id: value.id, version: value.version || '0.0.0' }
  }
  if (value.kind === 'pluginAction' && value.pluginId && value.connectionId && value.actionId) {
    return {
      kind: 'pluginAction',
      pluginId: value.pluginId,
      connectionId: value.connectionId,
      actionId: value.actionId,
      version: value.version || '0.0.0',
    }
  }
  throw new AgentRoleClientError('invalidRequest', 'Agent role dependency is incomplete')
}

function normalizeCapability(value: Record<string, unknown>): Record<string, string> {
  const kind = value.kind
  const version = typeof value.version === 'string' && value.version.trim() ? value.version : '0.0.0'
  if (kind === 'skill' || kind === 'mcp' || kind === 'tool') {
    if (typeof value.id !== 'string' || !value.id.trim()) {
      throw new AgentRoleClientError('invalidRequest', 'Agent role capability is incomplete')
    }
    return { kind, id: value.id, version }
  }
  if (kind === 'pluginAction'
    && typeof value.pluginId === 'string'
    && typeof value.connectionId === 'string'
    && typeof value.actionId === 'string'
    && value.pluginId.trim()
    && value.connectionId.trim()
    && value.actionId.trim()) {
    return {
      kind,
      pluginId: value.pluginId,
      connectionId: value.connectionId,
      actionId: value.actionId,
      version,
    }
  }
  throw new AgentRoleClientError('invalidRequest', 'Agent role capability is unsupported')
}

function mapAgentRoleError(value: unknown): AgentRoleClientError {
  if (value instanceof AgentRoleClientError) return value
  const candidate = value as { code?: unknown; kind?: unknown; message?: unknown } | null
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const kind = typeof candidate?.kind === 'string' ? candidate.kind : ''
  const message = typeof candidate?.message === 'string' ? candidate.message : typeof value === 'string' ? value : ''
  const normalized = `${code} ${kind} ${message}`.toLowerCase()
  if (normalized.includes('not found') || normalized.includes('unknown command') || normalized.includes('commandnotfound')) {
    return new AgentRoleClientError('commandUnavailable', 'Agent role command is unavailable')
  }
  if (normalized.includes('invalid') || normalized.includes('deserialize') || normalized.includes('expected')) {
    return new AgentRoleClientError('invalidRequest', 'Agent role payload was rejected')
  }
  return new AgentRoleClientError('transport', 'Agent role operation could not be completed')
}
