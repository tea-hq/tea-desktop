import type {
  CloudConversation,
  CloudConversationEvent,
  CloudRunnerTag,
  CreateCloudConversationRequest,
  RunnerRegistrationCommand,
  RunnerRegistrationCommandInput,
  RunnerTokenView,
  RunnerPermissionDecision,
} from '../../../packages/runner/src/protocol'
import type { ConversationSummary, PermissionMode } from '../../features/conversation/contracts'

const RUNNER_NPM_PACKAGE = '@tea/runner'

export interface CloudRunnerClientOptions {
  baseUrl: string
  accessToken: () => string | Promise<string>
  refreshAccessToken?: () => string | Promise<string>
  fetch?: typeof fetch
}

export class CloudRunnerRequestError extends Error {
  constructor(
    readonly code: 'centerUnavailable' | 'protocolFailure' | string,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'CloudRunnerRequestError'
  }
}

export interface CloudConversationClient {
  listRunnerTags(): Promise<CloudRunnerTag[]>
  listRunnerTokens?(): Promise<RunnerTokenView[]>
  resetPersonalRunnerToken?(): Promise<RunnerTokenView>
  createRunnerRegistrationCommand?(
    input?: RunnerRegistrationCommandInput,
  ): Promise<RunnerRegistrationCommand>
  listConversations(): Promise<CloudConversation[]>
  createConversation(
    request: CreateCloudConversationRequest,
    idempotencyKey: string,
  ): Promise<CloudConversation>
  getConversation(conversationId: string): Promise<CloudConversation>
  loadEvents(conversationId: string, after?: number): Promise<CloudConversationEvent[]>
  sendMessage(conversationId: string, text: string, idempotencyKey: string): Promise<void>
  shareConversation(
    conversationId: string,
    audienceType: 'tenant' | 'user' | 'group' | 'im_group',
    subjectId?: string,
  ): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  cancelConversation(conversationId: string): Promise<void>
  respondToApproval?(
    conversationId: string,
    approvalId: string,
    decision: RunnerPermissionDecision,
  ): Promise<void>
}

export class TeaCenterCloudRunnerClient implements CloudConversationClient {
  private readonly fetcher: typeof fetch
  private readonly baseUrl: string

  constructor(private readonly options: CloudRunnerClientOptions) {
    this.fetcher = options.fetch ?? fetch
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
  }

  listRunnerTags(): Promise<CloudRunnerTag[]> {
    return this.request<CloudRunnerTag[]>('/v1/cloud/runner-tags')
  }

  listRunnerTokens(): Promise<RunnerTokenView[]> {
    return this.request<RunnerTokenView[]>('/v1/cloud/runner-tokens')
  }

  resetPersonalRunnerToken(): Promise<RunnerTokenView> {
    return this.request<RunnerTokenView>('/v1/cloud/runner-tokens/user/reset', { method: 'POST' })
  }

  async createRunnerRegistrationCommand(
    input: RunnerRegistrationCommandInput = {},
  ): Promise<RunnerRegistrationCommand> {
    const tokens = await this.listRunnerTokens()
    const visibleTokens = tokens.filter((value) => !value.revokedAt && value.secret)
    const token = input.tokenId
      ? visibleTokens.find((value) => value.tokenId === input.tokenId)
      : [...visibleTokens].sort((left, right) => {
          const leftPriority = left.scope === 'tenant' ? 0 : left.scope === 'group' ? 1 : 2
          const rightPriority = right.scope === 'tenant' ? 0 : right.scope === 'group' ? 1 : 2
          return leftPriority - rightPriority || right.createdAt.localeCompare(left.createdAt)
        })[0]
    if (!token?.secret) throw new Error('active runner token is unavailable')

    const centerUrl = this.baseUrl
    const command = [
      `npx --yes ${RUNNER_NPM_PACKAGE} register`,
      `--center-url ${shellQuote(centerUrl)}`,
      `--token ${shellQuote(token.secret)}`,
      '--install-service',
    ].join(' ')
    return {
      tokenId: token.tokenId,
      scope: token.scope,
      scopeId: token.scopeId,
      centerUrl,
      command,
    }
  }

  listConversations(): Promise<CloudConversation[]> {
    return this.request<CloudConversation[]>('/v1/cloud/conversations')
  }

  createConversation(
    request: CreateCloudConversationRequest,
    idempotencyKey: string,
  ): Promise<CloudConversation> {
    return this.request<CloudConversation>('/v1/cloud/conversations', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(request),
    })
  }

  getConversation(conversationId: string): Promise<CloudConversation> {
    return this.request<CloudConversation>(
      `/v1/cloud/conversations/${encodeURIComponent(conversationId)}`,
    )
  }

  loadEvents(conversationId: string, after = 0): Promise<CloudConversationEvent[]> {
    return this.request<CloudConversationEvent[]>(
      `/v1/cloud/conversations/${encodeURIComponent(conversationId)}/events?after=${after}`,
    )
  }

  async sendMessage(conversationId: string, text: string, idempotencyKey: string): Promise<void> {
    await this.request<unknown>(
      `/v1/cloud/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ text }),
      },
    )
  }

  async shareConversation(
    conversationId: string,
    audienceType: 'tenant' | 'user' | 'group' | 'im_group',
    subjectId?: string,
  ): Promise<void> {
    await this.request(`/v1/cloud/conversations/${encodeURIComponent(conversationId)}/shares`, {
      method: 'POST',
      body: JSON.stringify({ audienceType, ...(subjectId === undefined ? {} : { subjectId }) }),
    })
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request(`/v1/cloud/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    })
  }

  async cancelConversation(conversationId: string): Promise<void> {
    await this.request(`/v1/cloud/conversations/${encodeURIComponent(conversationId)}/cancel`, {
      method: 'POST',
    })
  }

  async respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: RunnerPermissionDecision,
  ): Promise<void> {
    await this.request(
      `/v1/cloud/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(approvalId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      },
    )
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const send = async (accessToken: string): Promise<Response> =>
      this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...init.headers,
        },
      })
    let response: Response
    try {
      response = await send(await this.options.accessToken())
    } catch (cause) {
      throw normalizeCloudTransportError(cause)
    }
    if (response.status === 401 && this.options.refreshAccessToken) {
      try {
        response = await send(await this.options.refreshAccessToken())
      } catch (cause) {
        throw normalizeCloudTransportError(cause)
      }
    }
    if (!response.ok) {
      let detail: unknown
      try {
        detail = await response.json()
      } catch {
        detail = undefined
      }
      const serverMessage =
        isRecord(detail) && typeof detail.message === 'string' ? detail.message.trim() : ''
      const code =
        isRecord(detail) && typeof detail.code === 'string'
          ? detail.code
          : response.status >= 500
            ? 'centerUnavailable'
            : 'protocolFailure'
      throw new CloudRunnerRequestError(
        code,
        serverMessage || `Tea Center request failed: ${response.status}`,
        response.status >= 500 || response.status === 409,
      )
    }
    if (response.status === 202 || response.status === 204) return undefined as T
    try {
      return (await response.json()) as T
    } catch (cause) {
      throw new CloudRunnerRequestError(
        'protocolFailure',
        'Tea Center returned an invalid response',
        false,
        { cause },
      )
    }
  }
}

function normalizeCloudTransportError(value: unknown): CloudRunnerRequestError | unknown {
  if (value instanceof CloudRunnerRequestError) return value
  if (value instanceof Error && value.name === 'AbortError') {
    return new CloudRunnerRequestError('centerUnavailable', 'Tea Center request timed out', true, {
      cause: value,
    })
  }
  if (value instanceof TypeError) {
    return new CloudRunnerRequestError('centerUnavailable', 'Tea Center is unavailable', true, {
      cause: value,
    })
  }
  return value
}

export type ConversationExecutionTarget = 'local' | 'cloud'

export interface ConversationExecutionSelection {
  target: ConversationExecutionTarget
  runtimeId: string
  providerId?: string
  modelId?: string
  tags: string[]
}

export function toCloudConversationRequest(
  selection: ConversationExecutionSelection,
): CreateCloudConversationRequest {
  if (selection.target !== 'cloud') {
    throw new CloudRunnerRequestError('invalidRequest', 'cloud execution target is required', false)
  }
  if (!selection.providerId || !selection.modelId || selection.tags.length === 0) {
    throw new CloudRunnerRequestError(
      'invalidRequest',
      'cloud runtime, provider, model and tags are required',
      false,
    )
  }
  return {
    executionTarget: 'cloud',
    tags: [...selection.tags],
    runtimeId: selection.runtimeId,
    providerId: selection.providerId,
    modelId: selection.modelId,
  }
}

export function cloudConversationToSummary(value: CloudConversation): ConversationSummary {
  return {
    conversationId: value.conversationId,
    runtimeId: value.runtimeId,
    workspaceId: 'cloud',
    createdAt: Date.parse(value.createdAt),
    updatedAt: Date.parse(value.updatedAt),
    executionTarget: 'cloud',
    source: 'cloud',
    providerId: value.providerId,
    modelId: value.modelId,
    permissionMode: isPermissionMode(value.permissionMode) ? value.permissionMode : undefined,
    runnerTags: [...value.tags],
  }
}

function isPermissionMode(value: string | undefined): value is PermissionMode {
  return value === 'default' || value === 'readOnly' || value === 'fullAccess'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`
}
