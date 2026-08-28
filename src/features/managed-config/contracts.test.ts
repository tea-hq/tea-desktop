import { describe, expect, it } from 'vitest'
import { projectManagedConfiguration } from './contracts'

describe('managed configuration projection', () => {
  it('keeps only safe active catalog metadata', () => {
    const projected = projectManagedConfiguration({
      schemaVersion: 1,
      revision: 4,
      generatedAt: '2026-08-25T00:00:00Z',
      tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example' },
      user: {
        id: 'user-1',
        displayName: 'Ada',
        preferredUsername: 'ada',
        email: 'ada@example.test',
        emailVerified: true,
        avatarUrl: 'https://images.example.test/ada.png',
        oidcSubject: 'oidc-ada',
      },
      im: { provider: 'yunxin', appKey: 'public-key', accountStatus: 'notProvisioned' },
      modelProviders: [
        {
          id: 'active',
          kind: 'openai_compatible',
          displayName: 'Active',
          enabled: true,
          models: ['model-1'],
        },
        {
          id: 'disabled',
          kind: 'openai_compatible',
          displayName: 'Disabled',
          enabled: false,
          models: [],
        },
      ],
    })
    expect(projected?.revision).toBe(4)
    expect(projected?.modelProviders.map((provider) => provider.id)).toEqual(['active'])
    expect(JSON.stringify(projected)).not.toContain('secret')
  })
})
