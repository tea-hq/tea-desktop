import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listMock, saveMock, syncMock, MockAgentRoleClientError } = vi.hoisted(() => {
  class TestAgentRoleClientError extends Error {
    constructor(public readonly code: string, message = code) {
      super(message)
      this.name = 'AgentRoleClientError'
    }
  }
  return {
    listMock: vi.fn(),
    saveMock: vi.fn(),
    syncMock: vi.fn(),
    MockAgentRoleClientError: TestAgentRoleClientError,
  }
})

vi.mock('@/infrastructure/agent-roles/electronAgentRoleClient', () => ({
  AgentRoleClientError: MockAgentRoleClientError,
  listAgentRoles: listMock,
  saveAgentRoleRevision: saveMock,
  syncAgentRoles: syncMock,
}))

import { useAgentRolesStore } from './store'

describe('agent role store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listMock.mockReset().mockResolvedValue([])
    saveMock.mockReset().mockResolvedValue(undefined)
    syncMock.mockReset().mockResolvedValue([])
  })

  it('keeps the editor open state actionable when saving fails', async () => {
    saveMock.mockRejectedValue(new MockAgentRoleClientError('invalidRequest'))
    const store = useAgentRolesStore()

    const saved = await store.save({
      id: 'role.writer',
      name: 'Writer',
      description: '',
      runtimeId: 'builtin.tea',
      systemPrompt: '',
      userPromptTemplate: '',
      visibility: 'private',
      status: 'draft',
      capabilities: [],
      skills: [],
      plugins: [],
    })

    expect(saved).toBe(false)
    expect(store.saving).toBe(false)
    expect(store.error).toBe('management.agentRoles.invalidRequest')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('refreshes roles after a successful save', async () => {
    const store = useAgentRolesStore()

    const saved = await store.create()

    expect(saved).toBe(true)
    expect(saveMock).toHaveBeenCalledOnce()
    expect(listMock).toHaveBeenCalledOnce()
    expect(store.error).toBeNull()
  })
})
