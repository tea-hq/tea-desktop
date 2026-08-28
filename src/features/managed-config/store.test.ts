import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import type { EndpointBootstrap } from '@/features/auth/contracts'
import { useManagedConfigStore } from './store'

const bootstrap: EndpointBootstrap = {
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
  im: { provider: 'yunxin', appKey: 'public-key', accountStatus: 'active' },
  modelProviders: [
    {
      id: 'provider-1',
      kind: 'openai_compatible',
      displayName: 'Provider',
      enabled: true,
      models: ['model-1'],
    },
  ],
}

describe('managed configuration store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('accepts a reactive bootstrap projection from the auth store', () => {
    const store = useManagedConfigStore()

    expect(() => store.apply(reactive(bootstrap))).not.toThrow()
    expect(store.configuration).toEqual({
      revision: 4,
      im: bootstrap.im,
      modelProviders: bootstrap.modelProviders,
    })
  })
})
