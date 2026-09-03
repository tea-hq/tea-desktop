import { describe, expect, it } from 'vitest'

import { normalizeDirectoryUsersResponse } from './centerAuth'

const tenant = { id: 'tenant-1', domain: 'example.test', displayName: 'Example' }

function user(account = 'ada-1') {
  return {
    tenant,
    center: { userId: account, displayName: 'Ada' },
    oidc: {
      subject: `subject-${account}`,
      preferredUsername: 'ada',
      email: 'ada@example.test',
      emailVerified: true,
      avatarUrl: 'https://example.test/avatar.png',
    },
    im: { provider: 'yunxin', account, status: 'ready' },
  }
}

describe('normalizeDirectoryUsersResponse', () => {
  it('accepts a fully synchronized Yunxin directory projection', () => {
    expect(normalizeDirectoryUsersResponse({ schemaVersion: 1, users: [user()] }, tenant)).toEqual({
      schemaVersion: 1,
      users: [user()],
    })
  })

  it('rejects contacts without the Tea/Yunxin synchronization invariant', () => {
    expect(() =>
      normalizeDirectoryUsersResponse(
        { schemaVersion: 1, users: [{ ...user(), im: null }] },
        tenant,
      ),
    ).toThrow()
    expect(() =>
      normalizeDirectoryUsersResponse(
        {
          schemaVersion: 1,
          users: [{ ...user(), im: { provider: 'other', account: 'x', status: 'ready' } }],
        },
        tenant,
      ),
    ).toThrow()
  })

  it('rejects duplicate accounts and cross-tenant rows', () => {
    expect(() =>
      normalizeDirectoryUsersResponse({ schemaVersion: 1, users: [user(), user('ada-2')] }, tenant),
    ).not.toThrow()
    expect(() =>
      normalizeDirectoryUsersResponse({ schemaVersion: 1, users: [user(), user()] }, tenant),
    ).toThrow()
    expect(() =>
      normalizeDirectoryUsersResponse(
        { schemaVersion: 1, users: [{ ...user(), tenant: { ...tenant, id: 'tenant-2' } }] },
        tenant,
      ),
    ).toThrow()
  })
})
