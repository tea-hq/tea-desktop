import type { AcpAgentDefinition } from './agentDefinition'
import { ConversationRuntimeError, type RuntimeConversationCreateOptions } from '../runtime'

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export function acpProviderEnvironment(
  definition: AcpAgentDefinition,
  options: RuntimeConversationCreateOptions,
): Record<string, string> {
  const provider = options.provider
  if (!provider) return {}
  if (!options.model.trim() || options.model === 'default') return {}
  if (!provider.apiKey.trim()) throw invalidProvider('provider API key is empty')
  if (!safeEnvironmentText(provider.providerId) || !safeEnvironmentText(provider.apiKey)) {
    throw invalidProvider('provider credentials are invalid')
  }

  let url: URL
  try {
    url = new URL(provider.baseUrl)
  } catch {
    throw invalidProvider('provider base URL is invalid')
  }
  if (
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !HTTP_PROTOCOLS.has(url.protocol) ||
    (url.protocol === 'http:' && !isLoopback(url.hostname))
  ) {
    throw invalidProvider('provider base URL is invalid')
  }

  if (definition.runtimeId === 'external.claude') {
    return {
      CLAUDE_MODEL_CONFIG: JSON.stringify({
        availableModels: uniqueModels(provider.modelIds, options.model),
      }),
      // Claude ACP reads this official SDK option when constructing the
      // session model picker. CLAUDE_MODEL_CONFIG is passed as SDK settings,
      // but does not make an arbitrary provider model appear in ACP's
      // advertised configOptions on its own.
      ANTHROPIC_CUSTOM_MODEL_OPTION: options.model,
      ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: options.model,
      ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION: `Custom model (${options.model})`,
      ANTHROPIC_BASE_URL: provider.baseUrl,
      // The real credential is carried in a bounded custom header; the
      // placeholder only bypasses Claude Code's local-login check.
      ANTHROPIC_AUTH_TOKEN: 'acp-proxy',
      ANTHROPIC_CUSTOM_HEADERS: `x-api-key: ${provider.apiKey}`,
    }
  }

  if (definition.runtimeId === 'external.codex') {
    return {
      MODEL_PROVIDER: provider.providerId,
      CODEX_API_KEY: provider.apiKey,
      OPENAI_API_KEY: provider.apiKey,
      CODEX_CONFIG: JSON.stringify({
        model_provider: provider.providerId,
        model_providers: {
          [provider.providerId]: {
            name: provider.displayName,
            base_url: provider.baseUrl,
            wire_api: 'responses',
            env_key: 'OPENAI_API_KEY',
          },
        },
      }),
    }
  }

  throw invalidProvider(`provider routing is unsupported for ${definition.runtimeId}`)
}

function uniqueModels(modelIds: readonly string[], selectedModel: string): string[] {
  return [...new Set([...modelIds, selectedModel].filter((model) => model.trim() !== ''))]
}

function invalidProvider(message: string): ConversationRuntimeError {
  return new ConversationRuntimeError('invalidConfiguration', message)
}

function safeEnvironmentText(value: string): boolean {
  return !/[\u0000-\u001f\u007f]/.test(value)
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
