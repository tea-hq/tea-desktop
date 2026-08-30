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
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
