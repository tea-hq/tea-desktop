import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElectronManagedWorkspaceService, discoverProviderModels } from './managedWorkspace'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('discoverProviderModels', () => {
  it('loads and normalizes OpenAI-compatible models', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://models.example.test/v1/models')
      expect(init?.headers).toEqual({ authorization: 'Bearer provider-key' })
      return jsonResponse({
        object: 'list',
        data: [
          { id: 'model-b', owned_by: 'provider' },
          { id: 'model-a', display_name: 'Model A from API' },
        ],
      })
    })

    await expect(
      discoverProviderModels(
        {
          id: 'provider',
          kind: 'openai_compatible',
          displayName: 'Provider',
          status: 'ready',
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-key',
          models: [],
        },
        fetchImpl,
      ),
    ).resolves.toEqual([
      { id: 'model-b', displayName: 'model-b' },
      { id: 'model-a', displayName: 'Model A from API' },
    ])
  })

  it('loads Gemini models from v1beta and removes the resource prefix', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://generativelanguage.googleapis.com/v1beta/models')
      expect(init?.headers).toEqual({ 'x-goog-api-key': 'gemini-key' })
      return jsonResponse({
        models: [
          { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
          { name: 'models/gemini-2.5-flash' },
        ],
      })
    })

    await expect(
      discoverProviderModels(
        {
          id: 'gemini',
          kind: 'gemini',
          displayName: 'Gemini',
          status: 'ready',
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiKey: 'gemini-key',
          models: [],
        },
        fetchImpl,
      ),
    ).resolves.toEqual([
      { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', displayName: 'gemini-2.5-flash' },
    ])
  })

  it('loads Anthropic models from v1', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.anthropic.com/v1/models')
      expect(init?.headers).toEqual({
        'x-api-key': 'anthropic-key',
        'anthropic-version': '2023-06-01',
      })
      return jsonResponse({ data: [{ id: 'claude-sonnet', display_name: 'Claude Sonnet' }] })
    })

    await expect(
      discoverProviderModels(
        {
          id: 'anthropic',
          kind: 'anthropic',
          displayName: 'Anthropic',
          status: 'ready',
          baseUrl: 'https://api.anthropic.com',
          apiKey: 'anthropic-key',
          models: [],
        },
        fetchImpl,
      ),
    ).resolves.toEqual([{ id: 'claude-sonnet', displayName: 'Claude Sonnet' }])
  })

  it('silently ignores an unavailable provider endpoint', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('provider unavailable')
    })

    await expect(
      discoverProviderModels(
        {
          id: 'provider',
          kind: 'openai_compatible',
          displayName: 'Provider',
          status: 'ready',
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-key',
          models: [],
        },
        fetchImpl,
      ),
    ).resolves.toEqual([])
  })

  it('does not request disabled or unsupported providers', async () => {
    const fetchImpl = vi.fn()
    const provider = {
      id: 'provider',
      kind: 'openai_compatible',
      displayName: 'Provider',
      status: 'disabled' as const,
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'provider-key',
      models: [],
    }
    await expect(discoverProviderModels(provider, fetchImpl)).resolves.toEqual([])
    await expect(
      discoverProviderModels({ ...provider, status: 'ready', kind: 'custom' }, fetchImpl),
    ).resolves.toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('ElectronManagedWorkspaceService', () => {
  it('discovers models when the server omits its configured catalog', async () => {
    const runtimeConfiguration = vi.fn(async () => ({
      schemaVersion: 1,
      revision: 4,
      im: null,
      modelProviders: [
        {
          id: 'provider',
          kind: 'openai_compatible',
          displayName: 'Provider',
          status: 'ready' as const,
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-key',
        },
      ],
    }))
    const auth = {
      stateValue: () => ({
        phase: 'authenticated',
        bootstrap: {
          tenant: { id: 'tenant', domain: 'example.test', displayName: 'Example' },
          user: { id: 'user' },
        },
      }),
      runtimeConfiguration,
    }
    const service = new ElectronManagedWorkspaceService(auth as never, () => undefined)
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: 'model-a' }] }))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(service.refresh()).resolves.toMatchObject({
      modelProviders: [
        {
          id: 'provider',
          models: [{ id: 'model-a', selectionValue: 'provider/model-a' }],
        },
      ],
    })
    expect(service.resolveModelProvider('provider', 'model-a')).toEqual({
      providerId: 'provider',
      kind: 'openai_compatible',
      displayName: 'Provider',
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'provider-key',
      modelId: 'model-a',
      modelIds: ['model-a'],
    })
    expect(JSON.stringify(service.stateValue())).not.toContain('provider-key')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('merges discovered models after server configured models', async () => {
    const runtimeConfiguration = vi.fn(async () => ({
      schemaVersion: 1,
      revision: 3,
      im: null,
      modelProviders: [
        {
          id: 'provider',
          kind: 'openai_compatible',
          displayName: 'Provider',
          status: 'ready' as const,
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-key',
          models: [{ id: 'model-a', displayName: 'Configured A' }],
        },
      ],
    }))
    const auth = {
      stateValue: () => ({
        phase: 'authenticated',
        bootstrap: {
          tenant: { id: 'tenant', domain: 'example.test', displayName: 'Example' },
          user: { id: 'user' },
        },
      }),
      runtimeConfiguration,
    }
    const states: unknown[] = []
    const service = new ElectronManagedWorkspaceService(auth as never, (state) =>
      states.push(state),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ data: [{ id: 'model-b' }, { id: 'model-a', display_name: 'API A' }] }),
      ),
    )

    await expect(service.refresh()).resolves.toMatchObject({
      modelProviders: [
        {
          id: 'provider',
          models: [
            { id: 'model-a', displayName: 'Configured A', selectionValue: 'provider/model-a' },
            { id: 'model-b', displayName: 'model-b', selectionValue: 'provider/model-b' },
          ],
        },
      ],
    })
    expect(states).toHaveLength(2)
  })

  it('keeps configured models when discovery fails', async () => {
    const runtimeConfiguration = vi.fn(async () => ({
      schemaVersion: 1,
      revision: 4,
      im: null,
      modelProviders: [
        {
          id: 'provider',
          kind: 'openai_compatible',
          displayName: 'Provider',
          status: 'ready' as const,
          baseUrl: 'https://models.example.test/v1',
          apiKey: 'provider-key',
          models: [{ id: 'configured-model', displayName: 'Configured model' }],
        },
      ],
    }))
    const auth = {
      stateValue: () => ({
        phase: 'authenticated',
        bootstrap: {
          tenant: { id: 'tenant', domain: 'example.test', displayName: 'Example' },
          user: { id: 'user' },
        },
      }),
      runtimeConfiguration,
    }
    const service = new ElectronManagedWorkspaceService(auth as never, () => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
    )

    await expect(service.refresh()).resolves.toMatchObject({
      modelProviders: [
        {
          models: [
            {
              id: 'configured-model',
              selectionValue: 'provider/configured-model',
            },
          ],
        },
      ],
    })
  })

  it('keeps identical model ids distinct across providers', async () => {
    const runtimeConfiguration = vi.fn(async () => ({
      schemaVersion: 1,
      revision: 5,
      im: null,
      modelProviders: [
        {
          id: 'primary',
          kind: 'openai_compatible',
          displayName: 'Primary',
          status: 'ready' as const,
          baseUrl: 'https://primary.example.test/v1',
          apiKey: 'primary-key',
          models: [{ id: 'shared-model', displayName: 'Shared model' }],
        },
        {
          id: 'backup',
          kind: 'openai_compatible',
          displayName: 'Backup',
          status: 'ready' as const,
          baseUrl: 'https://backup.example.test/v1',
          apiKey: 'backup-key',
          models: [{ id: 'shared-model', displayName: 'Shared model' }],
        },
      ],
    }))
    const auth = {
      stateValue: () => ({
        phase: 'authenticated',
        bootstrap: {
          tenant: { id: 'tenant', domain: 'example.test', displayName: 'Example' },
          user: { id: 'user' },
        },
      }),
      runtimeConfiguration,
    }
    const service = new ElectronManagedWorkspaceService(auth as never, () => undefined)

    await expect(service.refresh()).resolves.toMatchObject({
      modelProviders: [
        { models: [{ selectionValue: 'primary/shared-model' }] },
        { models: [{ selectionValue: 'backup/shared-model' }] },
      ],
    })
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
