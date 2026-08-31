import { describe, expect, it } from 'vitest'

import { officialAcpAgentDefinitions } from './agentCatalog'
import { acpProviderEnvironment } from './providerEnvironment'

describe('acpProviderEnvironment', () => {
  const provider = {
    providerId: 'tokbox',
    kind: 'openai_compatible',
    displayName: 'Tokbox',
    baseUrl: 'https://models.example.test/v1',
    apiKey: 'provider-secret',
    modelId: 'gpt-5.6-luna',
    modelIds: ['gpt-5.6-luna'],
  }

  it('advertises the selected custom model and routes Claude through the provider', () => {
    const environment = acpProviderEnvironment(officialAcpAgentDefinitions()[0]!, {
      model: provider.modelId,
      provider,
    })

    expect(environment).toMatchObject({
      CLAUDE_MODEL_CONFIG: JSON.stringify({ availableModels: [provider.modelId] }),
      ANTHROPIC_CUSTOM_MODEL_OPTION: provider.modelId,
      ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: provider.modelId,
      ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION: `Custom model (${provider.modelId})`,
      ANTHROPIC_BASE_URL: provider.baseUrl,
      ANTHROPIC_AUTH_TOKEN: 'acp-proxy',
      ANTHROPIC_CUSTOM_HEADERS: `x-api-key: ${provider.apiKey}`,
    })
  })

  it('configures the Codex model provider without putting credentials in CODEX_CONFIG', () => {
    const environment = acpProviderEnvironment(officialAcpAgentDefinitions()[1]!, {
      model: provider.modelId,
      provider,
    })

    expect(environment).toMatchObject({
      MODEL_PROVIDER: provider.providerId,
      CODEX_API_KEY: provider.apiKey,
      OPENAI_API_KEY: provider.apiKey,
    })
    expect(JSON.parse(environment.CODEX_CONFIG!)).toEqual({
      model_provider: provider.providerId,
      model_providers: {
        [provider.providerId]: {
          name: provider.displayName,
          base_url: provider.baseUrl,
          wire_api: 'responses',
          env_key: 'OPENAI_API_KEY',
        },
      },
    })
    expect(environment.CODEX_CONFIG).not.toContain(provider.apiKey)
  })

  it('does not inject provider state for the default model', () => {
    expect(
      acpProviderEnvironment(officialAcpAgentDefinitions()[0]!, {
        model: 'default',
        provider,
      }),
    ).toEqual({})
  })

  it('rejects provider credentials over remote plain HTTP', () => {
    expect(() =>
      acpProviderEnvironment(officialAcpAgentDefinitions()[0]!, {
        model: provider.modelId,
        provider: { ...provider, baseUrl: 'http://models.example.test/v1' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalidConfiguration' }))
  })
})
