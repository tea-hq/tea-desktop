import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { AgentRoleDraft, AgentRoleRecord } from './contracts'
import {
  AgentRoleClientError,
  listAgentRoles,
  saveAgentRoleRevision,
  syncAgentRoles,
} from '@/infrastructure/agent-roles/electronAgentRoleClient'

export const useAgentRolesStore = defineStore('agentRoles', () => {
  const roles = ref<AgentRoleRecord[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function initialize(scope?: { tenantId: string; subjectId: string }): Promise<boolean> {
    if (loading.value) return false
    loading.value = true
    error.value = null
    try {
      roles.value = scope ? await syncAgentRoles(scope.tenantId, scope.subjectId) : await listAgentRoles()
      return true
    } catch (cause) {
      error.value = agentRoleErrorKey(cause, 'management.agentRoles.loadFailed')
      return false
    } finally { loading.value = false }
  }

  async function create(): Promise<boolean> {
    const id = `local-role-${Date.now()}`
    return save({ id, revision: 0, name: 'New role', description: '', runtimeId: 'external.claude', modelId: '', systemPrompt: '', userPromptTemplate: '', visibility: 'private', status: 'draft', capabilities: [], skills: [], plugins: [] })
  }

  async function save(draft: AgentRoleDraft & { id: string }): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    error.value = null
    try {
      const capabilities = (draft.capabilities ?? []).map(capability => ({
        kind: capability.kind,
        id: capability.id,
        ...(capability.version ? { version: capability.version } : {}),
      }))
      const dependencies = draft.dependencies?.map(dependency => ({
        ...dependency,
        version: dependency.version ?? '0.0.0',
      })) ?? (draft.capabilities ?? []).flatMap(capability => capability.kind === 'skill'
        ? [{ kind: 'skill', id: capability.id, version: capability.version ?? '0.0.0' }]
        : [])
      await saveAgentRoleRevision({
        roleId: draft.id,
        revision: draft.revision ?? 0,
        name: draft.name,
        description: draft.description,
        runtimeId: draft.runtimeId,
        modelId: draft.modelId,
        prompt: draft.systemPrompt ?? '',
        systemPrompt: draft.systemPrompt,
        userPromptTemplate: draft.userPromptTemplate,
        visibility: draft.visibility,
        status: draft.status,
        capabilities,
        dependencies,
      })
      return await initialize()
    } catch (cause) {
      error.value = agentRoleErrorKey(cause, 'management.agentRoles.saveFailed')
      return false
    } finally { saving.value = false }
  }

  function clearError(): void { error.value = null }

  return { roles, loading, saving, error, initialize, create, save, clearError }
})

function agentRoleErrorKey(cause: unknown, fallback: string): string {
  if (cause instanceof AgentRoleClientError) {
    if (cause.code === 'commandUnavailable') return 'management.agentRoles.commandUnavailable'
    if (cause.code === 'invalidRequest') return 'management.agentRoles.invalidRequest'
  }
  return fallback
}
