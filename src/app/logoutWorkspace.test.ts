import { describe, expect, it, vi } from 'vitest'

import { logoutWorkspace } from './logoutWorkspace'

describe('logoutWorkspace', () => {
  it('disposes the renderer workspace before Center logout', async () => {
    const order: string[] = []
    const exit = vi.fn(async () => { order.push('workspace') })
    const logout = vi.fn(async () => { order.push('center') })

    await logoutWorkspace({ exit }, logout)

    expect(order).toEqual(['workspace', 'center'])
  })

  it('still clears the Center session after a local disposal failure', async () => {
    const order: string[] = []
    const exit = vi.fn(async () => {
      order.push('workspace')
      throw new Error('local disposal failed')
    })
    const logout = vi.fn(async () => { order.push('center') })

    await expect(logoutWorkspace({ exit }, logout)).resolves.toBeUndefined()
    expect(order).toEqual(['workspace', 'center'])
  })
})
