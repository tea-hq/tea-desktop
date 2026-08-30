import type {
  ManagedModelProviderState,
  ManagedWorkspaceState,
} from '../../src/features/managed-runtime/contracts'
import type { ElectronCenterAuthService } from './centerAuth'

export interface ManagedImCredentials {
  appKey: string
  account: string
  token: string
}

export type ManagedWorkspaceStateEmitter = (state: ManagedWorkspaceState) => void

export interface RuntimeModel {
  id: string
  displayName: string
}

export interface RuntimeModelProvider {
  status: 'ready' | 'disabled' | 'unavailable'
  errorCode?: string
  id: string
  kind: string
  displayName: string
  baseUrl: string
  apiKey?: string
  models: RuntimeModel[]
}

type ModelDiscoveryFetch = typeof fetch

const MODEL_DISCOVERY_MAX_BYTES = 512 * 1024
const MODEL_DISCOVERY_TIMEOUT_MS = 5_000

export class ElectronManagedWorkspaceService {
  private state: ManagedWorkspaceState = {
    generation: 0,
    phase: 'inactive',
    modelProviders: [],
  }
  private imCredentials: ManagedImCredentials | null = null

  constructor(
    private readonly auth: ElectronCenterAuthService,
    private readonly emitState: ManagedWorkspaceStateEmitter,
  ) {}

  stateValue(): ManagedWorkspaceState {
    return structuredClone(this.state)
  }

  async refresh(): Promise<ManagedWorkspaceState> {
    const auth = this.auth.stateValue()
    if (!auth.bootstrap || (auth.phase !== 'authenticated' && auth.phase !== 'offlineCached')) {
      this.imCredentials = null
      this.setState({
        phase: 'inactive',
        tenantId: undefined,
        userId: undefined,
        im: undefined,
        modelProviders: [],
      })
      return this.stateValue()
    }
    this.setState({
      phase: 'preparing',
      tenantId: auth.bootstrap.tenant.id,
      userId: auth.bootstrap.user.id,
      errorCode: undefined,
    })
    try {
      const configuration = (await this.auth.runtimeConfiguration()) as RuntimeConfiguration
      const providers = await Promise.all(
        configuration.modelProviders.map(async (value) => {
          const models = await mergeProviderModels(value)
          return {
            id: value.id,
            kind: value.kind,
            displayName: value.displayName,
            status: value.status,
            ...(value.errorCode ? { errorCode: value.errorCode } : {}),
            models: models.map((model) => ({
              id: model.id,
              displayName: model.displayName,
              selectionValue: `${value.id}/${model.id}`,
            })),
          } satisfies ManagedModelProviderState
        }),
      )
      this.imCredentials =
        configuration.im?.status === 'ready' &&
        configuration.im.appKey &&
        configuration.im.account &&
        configuration.im.token
          ? {
              appKey: configuration.im.appKey,
              account: configuration.im.account,
              token: configuration.im.token,
            }
          : null
      this.setState({
        phase:
          this.imCredentials || providers.some((provider) => provider.status === 'ready')
            ? 'ready'
            : 'degraded',
        im: configuration.im
          ? {
              status: configuration.im.status,
              ...(configuration.im.errorCode ? { errorCode: configuration.im.errorCode } : {}),
            }
          : undefined,
        modelProviders: providers,
      })
      return this.stateValue()
    } catch (error) {
      this.imCredentials = null
      const code = errorCode(error)
      this.setState({
        phase: code === 'centerUnavailable' ? 'offline' : 'failed',
        errorCode: code,
      })
      throw error
    }
  }

  getImCredentials(): ManagedImCredentials {
    if (!this.imCredentials || this.state.im?.status !== 'ready')
      throw serviceError('imRuntimeUnavailable', false)
    return structuredClone(this.imCredentials)
  }

  private setState(update: Partial<ManagedWorkspaceState>): void {
    this.state = {
      ...this.state,
      ...update,
      generation: this.state.generation + 1,
    }
    this.emitState(this.stateValue())
  }
}

interface RuntimeConfiguration {
  schemaVersion: number
  revision: number
  im: {
    status: 'ready' | 'disabled' | 'unavailable'
    errorCode?: string
    provider: string
    appKey: string
    account: string
    token: string
  } | null
  modelProviders: RuntimeModelProvider[]
}

async function mergeProviderModels(provider: RuntimeModelProvider): Promise<RuntimeModel[]> {
  const configured = normalizeModels(provider.models)
  const discovered = await discoverProviderModels(provider)
  const models = [...configured]
  const ids = new Set(configured.map((model) => model.id))
  for (const model of discovered) {
    if (!ids.has(model.id)) {
      ids.add(model.id)
      models.push(model)
    }
  }
  return models
}

export async function discoverProviderModels(
  provider: RuntimeModelProvider,
  fetchImpl: ModelDiscoveryFetch = fetch,
): Promise<RuntimeModel[]> {
  if (provider.status !== 'ready' || !provider.apiKey?.trim()) return []
  const request = modelDiscoveryRequest(provider)
  if (!request) return []

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS)
  try {
    const response = await fetchImpl(request.url, {
      method: 'GET',
      headers: request.headers,
      signal: controller.signal,
      redirect: 'error',
    })
    if (!response.ok) return []
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MODEL_DISCOVERY_MAX_BYTES) return []
    const parsed: unknown = bytes.byteLength
      ? JSON.parse(Buffer.from(bytes).toString('utf8'))
      : null
    return parseDiscoveredModels(parsed, request.format)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

function modelDiscoveryRequest(
  provider: RuntimeModelProvider,
): { url: string; headers: Record<string, string>; format: 'openai' | 'gemini' } | null {
  const apiKey = provider.apiKey?.trim()
  if (!apiKey) return null
  const kind = provider.kind.trim().toLocaleLowerCase('en')
  const isGemini =
    kind === 'gemini' ||
    kind === 'google' ||
    kind === 'google_gemini' ||
    kind === 'google-gemini' ||
    kind === 'google_generative_ai' ||
    kind === 'google-generative-ai'
  const isOpenAiCompatible =
    kind === 'openai' || kind === 'openai_compatible' || kind === 'openai-compatible'
  const isAnthropic = kind === 'anthropic'
  if (!isGemini && !isOpenAiCompatible && !isAnthropic) return null

  let base: URL
  try {
    base = new URL(provider.baseUrl)
  } catch {
    return null
  }
  if (
    !base.hostname ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && isLoopback(base.hostname)))
  ) {
    return null
  }
  const path = base.pathname.replace(/\/+$/, '')
  base.pathname = path || '/'
  const alreadyModels = path.endsWith('/models')
  if (!alreadyModels) {
    const version = isGemini
      ? path.endsWith('/v1beta')
        ? ''
        : '/v1beta'
      : path.endsWith('/v1') || path.endsWith('/v1beta')
        ? ''
        : '/v1'
    base.pathname = `${path}${version}/models` || '/models'
  }
  return {
    url: base.toString(),
    headers: isGemini
      ? { 'x-goog-api-key': apiKey }
      : isAnthropic
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : { authorization: `Bearer ${apiKey}` },
    format: isGemini ? 'gemini' : 'openai',
  }
}

function parseDiscoveredModels(value: unknown, format: 'openai' | 'gemini'): RuntimeModel[] {
  if (!isRecord(value)) return []
  const candidates = value[format === 'gemini' ? 'models' : 'data']
  if (!Array.isArray(candidates)) return []
  const models: RuntimeModel[] = []
  const ids = new Set<string>()
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue
    const rawId = format === 'gemini' ? candidate.name : candidate.id
    if (typeof rawId !== 'string') continue
    const id = format === 'gemini' ? rawId.replace(/^models\//, '') : rawId
    const displayName = firstText(candidate.displayName, candidate.display_name, id)
    if (!validModelText(id) || !validModelText(displayName) || ids.has(id)) continue
    ids.add(id)
    models.push({ id, displayName })
  }
  return models
}

function normalizeModels(values: RuntimeModel[]): RuntimeModel[] {
  const models: RuntimeModel[] = []
  const ids = new Set<string>()
  for (const value of values) {
    const id = typeof value.id === 'string' ? value.id.trim() : ''
    const displayName =
      typeof value.displayName === 'string' && value.displayName.trim() !== ''
        ? value.displayName.trim()
        : id
    if (!validModelText(id) || !validModelText(displayName) || ids.has(id)) continue
    ids.add(id)
    models.push({ id, displayName })
  }
  return models
}

function validModelText(value: string): boolean {
  return value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value)
}

function firstText(...values: unknown[]): string {
  return (
    values
      .find((value): value is string => typeof value === 'string' && value.trim() !== '')
      ?.trim() ?? ''
  )
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorCode(error: unknown): string {
  const value = error as { code?: unknown } | null
  return typeof value?.code === 'string' ? value.code : 'runtimeUnavailable'
}

function serviceError(code: string, retryable: boolean): { code: string; retryable: boolean } {
  return { code, retryable }
}
