import { describe, expect, it } from 'vitest'

import { WorkspaceLifecycle, type WorkspaceSession } from './workspaceLifecycle'

interface ControlledSession extends WorkspaceSession {
  name: string
  initialized: boolean
  disposed: number
  release: () => void
}

describe('WorkspaceLifecycle', () => {
  it('disposes a starting tenant immediately when the workspace exits', async () => {
    const lifecycle = new WorkspaceLifecycle()
    const tenant = controlledSession('tenant-a')

    const entering = lifecycle.enter(tenant.name, () => tenant)
    await Promise.resolve()
    const exiting = lifecycle.exit()

    expect(tenant.disposed).toBe(1)
    tenant.release()
    await Promise.all([entering, exiting])
    expect(tenant.initialized).toBe(false)
  })

  it('replaces tenant A with a fresh tenant B session', async () => {
    const lifecycle = new WorkspaceLifecycle()
    const tenantA = immediateSession('tenant-a')
    const tenantB = immediateSession('tenant-b')
    await lifecycle.enter(tenantA.name, () => tenantA)

    await lifecycle.enter(tenantB.name, () => tenantB)

    expect(tenantA.disposed).toBe(1)
    expect(tenantB.initialized).toBe(true)
    expect(tenantB.disposed).toBe(0)
  })
})

function controlledSession(name: string): ControlledSession {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const session: ControlledSession = {
    name,
    initialized: false,
    disposed: 0,
    release,
    async initialize(isCurrent) {
      await gate
      if (isCurrent()) session.initialized = true
    },
    async dispose() { session.disposed += 1 },
  }
  return session
}

function immediateSession(name: string): ControlledSession {
  const session: ControlledSession = {
    name,
    initialized: false,
    disposed: 0,
    release: () => undefined,
    async initialize(isCurrent) { session.initialized = isCurrent() },
    async dispose() { session.disposed += 1 },
  }
  return session
}
