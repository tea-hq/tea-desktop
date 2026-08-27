import { describe, expect, it, vi } from 'vitest'

import type { CenterAuthPhase } from '@/features/auth/contracts'
import { recoverManagedWorkspace } from './refreshManagedWorkspace'

describe('recoverManagedWorkspace', () => {
  it('restores Center auth before refreshing managed credentials and connecting IM', async () => {
    const order: string[] = []
    const auth = {
      state: { phase: 'offlineCached' as CenterAuthPhase },
      async refresh() {
        order.push('auth')
        auth.state.phase = 'authenticated'
      },
    }
    const managed = {
      imReady: false,
      async refresh() {
        order.push('managed')
        managed.imReady = true
      },
    }
    const connect = vi.fn(async () => { order.push('im') })

    await recoverManagedWorkspace(auth, managed, connect)

    expect(order).toEqual(['auth', 'managed', 'im'])
  })

  it('does not request managed credentials while Center remains offline', async () => {
    const auth = {
      state: { phase: 'offlineCached' as CenterAuthPhase },
      refresh: vi.fn(async () => undefined),
    }
    const managed = { imReady: false, refresh: vi.fn(async () => undefined) }
    const connect = vi.fn(async () => undefined)

    await recoverManagedWorkspace(auth, managed, connect)

    expect(auth.refresh).toHaveBeenCalledOnce()
    expect(managed.refresh).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('refreshes an authenticated workspace without rotating the Center session', async () => {
    const auth = {
      state: { phase: 'authenticated' as CenterAuthPhase },
      refresh: vi.fn(async () => undefined),
    }
    const managed = { imReady: false, refresh: vi.fn(async () => undefined) }

    await recoverManagedWorkspace(auth, managed, vi.fn(async () => undefined))

    expect(auth.refresh).not.toHaveBeenCalled()
    expect(managed.refresh).toHaveBeenCalledOnce()
  })
})
