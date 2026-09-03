import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveDevelopmentUserDataPath } from './developmentProfile'

describe('resolveDevelopmentUserDataPath', () => {
  it('keeps the platform user data path unchanged outside development', () => {
    expect(
      resolveDevelopmentUserDataPath({
        appDataPath: '/application-data',
        appRoot: '/worktrees/tea-desktop',
      }),
    ).toBeNull()
  })

  it('returns a stable profile scoped to the development checkout', () => {
    const options = {
      appDataPath: '/application-data',
      appRoot: '/worktrees/tea-desktop',
      devServerUrl: 'http://127.0.0.1:1420/',
    }

    const first = resolveDevelopmentUserDataPath(options)
    expect(first).toBe(resolveDevelopmentUserDataPath(options))
    expect(first).toMatch(
      new RegExp(
        `^${escapeRegExp(path.join('/application-data', 'Tea', 'Development', 'tea-desktop-'))}[a-f0-9]{12}$`,
      ),
    )
  })

  it('isolates separate worktrees', () => {
    const shared = {
      appDataPath: '/application-data',
      devServerUrl: 'http://127.0.0.1:1420/',
    }

    expect(
      resolveDevelopmentUserDataPath({ ...shared, appRoot: '/worktrees/feature-a/tea-desktop' }),
    ).not.toBe(
      resolveDevelopmentUserDataPath({ ...shared, appRoot: '/worktrees/feature-b/tea-desktop' }),
    )
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
