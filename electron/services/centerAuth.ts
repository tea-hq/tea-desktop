import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { safeStorage, shell } from 'electron'

import type {
  CenterAuthErrorCode,
  CenterAuthInitialization,
  CenterAuthState,
  EndpointBootstrap,
  EnterpriseDirectory,
} from '../../src/features/auth/contracts'
import { SIGNED_OUT_STATE } from '../../src/features/auth/contracts'
import type { DirectoryListOptions, DirectoryUser } from '../../src/features/directory/contracts'
import { JsonStore } from './jsonStore'
import {
  handoffProofPayload,
  normalizeCenterAuthErrorCode,
  refreshProofPayload,
} from './centerAuthProtocol'

interface AuthFile {
  endpointInstanceId: string
  publicKey: string
  encryptedPrivateKey?: string
  encryptedRefresh?: string
  cachedState?: CenterAuthState
}

interface SessionResponse {
  accessToken: string
  accessTokenExpiresAt: string
  refreshCredential: string
  refreshExpiresAt: string
  deviceId: string
  endpointSessionId: string
  capabilities: string[]
}

interface PendingLogin {
  generation: number
  transactionId: string
  verifier: string
  enterprise: EnterpriseDirectory
  server: ReturnType<typeof createServer>
  callbackPath: string
}

interface DirectoryCache {
  tenantId: string
  fetchedAt: number
  users: DirectoryUser[]
}

interface DirectoryRequest {
  tenantId: string
  generation: number
  operation: Promise<{ schemaVersion: 1; users: DirectoryUser[] }>
}

const DIRECTORY_CACHE_TTL_MS = 30_000

export type AuthStateEmitter = (state: CenterAuthState) => void

export class ElectronCenterAuthService {
  private readonly store: JsonStore<AuthFile>
  private state: CenterAuthState = structuredClone(SIGNED_OUT_STATE)
  private file: AuthFile = { endpointInstanceId: '', publicKey: '' }
  private accessToken: string | null = null
  private pending: PendingLogin | null = null
  private generation = 0
  private directoryCache: DirectoryCache | null = null
  private directoryRequest: DirectoryRequest | null = null
  private directoryGeneration = 0

  constructor(
    filePath: string,
    private readonly emitState: AuthStateEmitter,
    private readonly now: () => number = Date.now,
  ) {
    this.store = new JsonStore(filePath, {
      schemaVersion: 1,
      maxBytes: 512 * 1024,
    })
  }

  async initialize(): Promise<CenterAuthInitialization> {
    this.file = await this.store.load({
      endpointInstanceId: randomId(),
      publicKey: '',
    })
    if (!this.file.endpointInstanceId) {
      this.file.endpointInstanceId = randomId()
      await this.persist()
    }
    const cached = this.file.cachedState
    const refresh = this.loadSecret(this.file.encryptedRefresh)
    if (cached?.bootstrap && refresh) {
      this.state = { ...cached, phase: 'offlineCached', errorCode: null }
      this.emitState(structuredClone(this.state))
      try {
        await this.refreshSession(refresh)
      } catch (error) {
        if (!isCenterUnavailable(error)) await this.invalidate(error)
      }
    }
    return {
      state: structuredClone(this.state),
      defaultEnterpriseDomain: normalizeDomain(process.env['TEA_CENTER_ENTERPRISE_DOMAIN']),
    }
  }

  async resolveEnterprise(domain: string): Promise<EnterpriseDirectory> {
    const normalized = normalizeDomain(domain)
    if (!normalized) throw serviceError('invalidRequest', false, 'enterprise domain is invalid')
    this.setState({ phase: 'resolving', errorCode: null })
    try {
      const enterprise = await this.request<EnterpriseDirectory>(
        `/v1/enterprise-directory/${encodeURIComponent(normalized)}`,
      )
      if (!enterprise.loginAvailable || enterprise.organizationDomain !== normalized)
        throw serviceError('organizationUnavailable', false)
      this.setState({ phase: 'signedOut', enterprise, errorCode: null })
      return enterprise
    } catch (error) {
      this.setState({ phase: 'signedOut', errorCode: errorCode(error) })
      throw error
    }
  }

  async startLogin(domain: string): Promise<CenterAuthState> {
    if (this.pending) await this.cancelLogin()
    await this.ensureIdentity()
    const enterprise =
      this.state.enterprise?.organizationDomain === normalizeDomain(domain)
        ? this.state.enterprise
        : await this.resolveEnterprise(domain)
    const server = createServer()
    const callbackNonce = randomBytes(32).toString('base64url')
    const callbackPath = `/auth/complete/${callbackNonce}`
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    let keepServer = false
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw serviceError('invalidCallback', false)
      const callbackUrl = `http://127.0.0.1:${address.port}${callbackPath}`
      const transactionId = `desktop-${randomId()}`
      const verifier = randomId() + randomId()
      const challenge = createHash('sha256').update(verifier).digest('hex')
      const response = await this.request<{
        transactionId: string
        browserUrl: string
        expiresAt: string
      }>('/v1/desktop-logins', {
        method: 'POST',
        body: {
          transactionId,
          endpointInstanceId: this.file.endpointInstanceId,
          organizationDomain: enterprise.organizationDomain,
          handoffChallenge: challenge,
          devicePublicKeyRef: this.file.publicKey,
          callbackUrl,
        },
      })
      if (response.transactionId !== transactionId || !response.browserUrl)
        throw serviceError('protocolFailure', false)
      const generation = ++this.generation
      this.pending = {
        generation,
        transactionId,
        verifier,
        enterprise,
        server,
        callbackPath,
      }
      server.on('request', (request, responseWriter) =>
        this.handleCallback(request, responseWriter, this.pending),
      )
      this.setState({ phase: 'browserPending', enterprise, errorCode: null })
      await shell.openExternal(response.browserUrl)
      keepServer = true
      return structuredClone(this.state)
    } finally {
      if (!keepServer) {
        if (this.pending?.server === server) this.pending = null
        await closeServer(server)
      }
    }
  }

  async cancelLogin(): Promise<CenterAuthState> {
    ++this.generation
    this.pending?.server.close()
    this.pending = null
    this.clearDirectoryCache()
    this.setState({
      phase: 'signedOut',
      bootstrap: null,
      errorCode: 'loginCancelled',
    })
    return structuredClone(this.state)
  }

  async refreshBootstrap(): Promise<CenterAuthState> {
    if (!this.accessToken) {
      const refresh = this.loadSecret(this.file.encryptedRefresh)
      if (!refresh) {
        await this.invalidate(serviceError('recoveryRequired', false))
        throw serviceError('recoveryRequired', false)
      }
      await this.refreshSession(refresh)
    }
    try {
      const bootstrap = await this.request<EndpointBootstrap>('/v1/endpoint/bootstrap', {
        token: this.accessToken!,
      })
      await this.acceptBootstrap(bootstrap)
      return structuredClone(this.state)
    } catch (error) {
      if (isCenterUnavailable(error)) throw error
      await this.invalidate(error)
      throw error
    }
  }

  async logout(): Promise<CenterAuthState> {
    const token = this.accessToken
    this.accessToken = null
    this.clearDirectoryCache()
    await this.cancelLogin()
    if (token)
      await this.request('/v1/endpoint-sessions/current', {
        method: 'DELETE',
        token,
      }).catch(() => undefined)
    this.file.encryptedRefresh = undefined
    this.file.cachedState = undefined
    await this.persist()
    this.setState({
      phase: 'signedOut',
      enterprise: null,
      bootstrap: null,
      errorCode: null,
    })
    return structuredClone(this.state)
  }

  stateValue(): CenterAuthState {
    return structuredClone(this.state)
  }

  /** Main-process-only access for Center-owned adapters. The token is never
   * exposed through preload or renderer storage. */
  async cloudAccessToken(): Promise<string> {
    if (!this.accessToken) {
      const refresh = this.loadSecret(this.file.encryptedRefresh)
      if (!refresh) throw serviceError('recoveryRequired', false)
      await this.refreshSession(refresh)
    }
    if (!this.accessToken) throw serviceError('recoveryRequired', false)
    return this.accessToken
  }

  async refreshCloudAccessToken(): Promise<string> {
    const refresh = this.loadSecret(this.file.encryptedRefresh)
    if (!refresh) throw serviceError('recoveryRequired', false)
    await this.refreshSession(refresh)
    return this.cloudAccessToken()
  }

  centerOriginValue(): string | null {
    return centerOrigin()
  }

  async listDirectoryUsers(options: DirectoryListOptions = {}): Promise<{
    schemaVersion: number
    users: DirectoryUser[]
  }> {
    const tenantId = this.state.bootstrap?.tenant.id
    if (!tenantId) throw serviceError('recoveryRequired', false)
    const forceRefresh = options.forceRefresh === true
    const generation = this.directoryGeneration
    const cached = this.directoryCache
    const age = cached ? this.now() - cached.fetchedAt : Number.POSITIVE_INFINITY
    if (
      !forceRefresh &&
      cached?.tenantId === tenantId &&
      age >= 0 &&
      age < DIRECTORY_CACHE_TTL_MS
    ) {
      return cloneDirectoryResponse(cached.users)
    }
    const currentRequest = this.directoryRequest
    if (currentRequest?.tenantId === tenantId && currentRequest.generation === generation) {
      return structuredClone(await currentRequest.operation)
    }

    const operation = (async (): Promise<{ schemaVersion: 1; users: DirectoryUser[] }> => {
      const response = await this.authenticatedRequest<unknown>('/v1/endpoint/directory/users')
      const normalized = normalizeDirectoryUsersResponse(response, this.state.bootstrap?.tenant)
      if (generation === this.directoryGeneration && this.state.bootstrap?.tenant.id === tenantId) {
        this.directoryCache = {
          tenantId,
          fetchedAt: this.now(),
          users: structuredClone(normalized.users),
        }
      }
      return normalized
    })()
    const request: DirectoryRequest = { tenantId, generation, operation }
    this.directoryRequest = request
    try {
      return structuredClone(await operation)
    } finally {
      if (this.directoryRequest === request) this.directoryRequest = null
    }
  }

  async isDirectoryContact(accountId: string): Promise<boolean> {
    const target = accountId.trim()
    if (!target || target.length > 128) return false
    const response = await this.listDirectoryUsers()
    return response.users.some((user) => user.im?.account === target)
  }

  async listAgentRoles(): Promise<unknown> {
    return this.authenticatedRequest('/v1/agent-roles')
  }

  async runtimeConfiguration(): Promise<unknown> {
    return this.authenticatedRequest('/v1/endpoint/runtime-configuration')
  }

  async listEnabledPlugins(signal?: AbortSignal): Promise<unknown> {
    return this.authenticatedRequest('/v1/endpoint/plugins', { signal, maxResponseBytes: 4 << 20 })
  }

  async callPlugin(
    pluginId: string,
    operationId: string,
    argumentsValue: Record<string, unknown>,
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.authenticatedRequest(
      `/v1/endpoint/plugins/${encodeURIComponent(pluginId)}/operations/${encodeURIComponent(operationId)}`,
      {
        method: 'POST',
        body: { arguments: argumentsValue },
        headers: { 'x-conversation-id': conversationId },
        signal,
        maxResponseBytes: 5 << 20,
      },
    )
  }

  private async handleCallback(
    request: IncomingMessage,
    response: ServerResponse,
    pending: PendingLogin | null,
  ): Promise<void> {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (!pending || url.pathname !== pending.callbackPath) {
      response.writeHead(404)
      response.end()
      return
    }
    const transaction = url.searchParams.get('transaction')
    const code = url.searchParams.get('code')
    if (
      !transaction ||
      !code ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(transaction) ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(code)
    ) {
      response.writeHead(400, { 'cache-control': 'no-store' })
      response.end('Invalid Tea authentication callback')
      return
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    })
    response.end('<!doctype html><title>Tea</title><p>Authentication received. Return to Tea.</p>')
    this.pending = null
    pending.server.close()
    void this.completeLogin(pending, transaction, code)
  }

  private async completeLogin(
    pending: PendingLogin,
    transactionId: string,
    code: string,
  ): Promise<void> {
    if (pending.generation !== this.generation || transactionId !== pending.transactionId) return
    this.setState({
      phase: 'exchanging',
      enterprise: pending.enterprise,
      errorCode: null,
    })
    try {
      const privateKey = this.loadPrivateKey()
      const signature = sign(null, handoffProofPayload(transactionId, code), privateKey).toString(
        'base64url',
      )
      const session = await this.request<SessionResponse>('/v1/endpoint-sessions/exchange', {
        method: 'POST',
        body: {
          transactionId,
          code,
          handoffVerifier: pending.verifier,
          deviceProof: {
            algorithm: 'ed25519',
            keyId: this.file.publicKey,
            signature,
          },
        },
      })
      if (!validSession(session)) throw serviceError('protocolFailure', false)
      this.accessToken = session.accessToken
      this.file.encryptedRefresh = this.saveSecret(session.refreshCredential)
      const bootstrap = await this.request<EndpointBootstrap>('/v1/endpoint/bootstrap', {
        token: session.accessToken,
      })
      await this.acceptBootstrap(bootstrap)
    } catch (error) {
      await this.invalidate(error)
    }
  }

  private async refreshSession(refresh: string): Promise<void> {
    const privateKey = this.loadPrivateKey()
    const signature = sign(null, refreshProofPayload(refresh), privateKey).toString('base64url')
    const session = await this.request<SessionResponse>('/v1/endpoint-sessions/refresh', {
      method: 'POST',
      body: {
        refreshCredential: refresh,
        deviceProof: {
          algorithm: 'ed25519',
          keyId: this.file.publicKey,
          signature,
        },
      },
    })
    if (!validSession(session)) throw serviceError('protocolFailure', false)
    this.accessToken = session.accessToken
    this.file.encryptedRefresh = this.saveSecret(session.refreshCredential)
    const bootstrap = await this.request<EndpointBootstrap>('/v1/endpoint/bootstrap', {
      token: session.accessToken,
    })
    await this.acceptBootstrap(bootstrap)
  }

  private async authenticatedRequest<T>(
    endpoint: string,
    options: {
      method?: string
      body?: unknown
      headers?: Record<string, string>
      signal?: AbortSignal
      maxResponseBytes?: number
    } = {},
  ): Promise<T> {
    if (!this.accessToken) {
      const refresh = this.loadSecret(this.file.encryptedRefresh)
      if (!refresh) throw serviceError('recoveryRequired', false)
      await this.refreshSession(refresh)
    }
    try {
      return await this.request<T>(endpoint, { ...options, token: this.accessToken! })
    } catch (error) {
      if (errorCode(error) !== 'recoveryRequired') throw error
      const refresh = this.loadSecret(this.file.encryptedRefresh)
      if (!refresh) throw error
      await this.refreshSession(refresh)
      return this.request<T>(endpoint, { ...options, token: this.accessToken! })
    }
  }

  private async acceptBootstrap(bootstrap: EndpointBootstrap): Promise<void> {
    this.clearDirectoryCache()
    const enterprise: EnterpriseDirectory = {
      organizationDomain: bootstrap.tenant.domain,
      displayName: bootstrap.tenant.displayName,
      loginAvailable: true,
    }
    this.state = {
      generation: this.generation,
      phase: 'authenticated',
      enterprise,
      bootstrap,
      lastValidatedAt: this.now(),
      errorCode: null,
    }
    this.file.cachedState = structuredClone(this.state)
    await this.persist()
    this.emitState(structuredClone(this.state))
  }

  private async invalidate(error: unknown): Promise<void> {
    this.accessToken = null
    this.clearDirectoryCache()
    this.file.encryptedRefresh = undefined
    this.file.cachedState = undefined
    await this.persist()
    this.setState({
      phase: 'recoveryRequired',
      bootstrap: null,
      errorCode: errorCode(error),
    })
  }

  private setState(update: Partial<CenterAuthState>): void {
    this.state = { ...this.state, ...update, generation: this.generation }
    this.emitState(structuredClone(this.state))
  }

  private async createIdentity(current: AuthFile): Promise<AuthFile> {
    if (!safeStorage.isEncryptionAvailable()) throw serviceError('secureStorageUnavailable', true)
    const pair = generateKeyPairSync('ed25519')
    const publicDer = pair.publicKey.export({ type: 'spki', format: 'der' })
    return {
      endpointInstanceId: current.endpointInstanceId || randomId(),
      publicKey: publicDer.subarray(-32).toString('base64url'),
      encryptedPrivateKey: safeStorage
        .encryptString(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
        .toString('base64'),
      encryptedRefresh: current.encryptedRefresh,
      cachedState: current.cachedState,
    }
  }

  private async ensureIdentity(): Promise<void> {
    if (this.file.publicKey && this.file.encryptedPrivateKey) return
    this.file = await this.createIdentity(this.file)
    await this.persist()
  }

  private loadPrivateKey() {
    const pem = this.loadSecret(this.file.encryptedPrivateKey)
    if (!pem) throw serviceError('secureStorageUnavailable', true)
    return pem
  }

  private loadSecret(value: string | undefined): string | null {
    if (!value || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return null
    }
  }

  private saveSecret(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) throw serviceError('secureStorageUnavailable', true)
    return safeStorage.encryptString(value).toString('base64')
  }

  private async persist(): Promise<void> {
    await this.store.save(this.file)
  }

  private clearDirectoryCache(): void {
    this.directoryGeneration += 1
    this.directoryCache = null
  }

  private async request<T = unknown>(
    endpoint: string,
    options: {
      method?: string
      body?: unknown
      token?: string
      headers?: Record<string, string>
      signal?: AbortSignal
      maxResponseBytes?: number
    } = {},
  ): Promise<T> {
    const origin = centerOrigin()
    if (!origin)
      throw serviceError('centerUnavailable', true, 'TEA_CENTER_ORIGIN is not configured')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const signal = options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal
      const response = await fetch(new URL(endpoint, `${origin}/`).toString(), {
        method: options.method || 'GET',
        headers: {
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...options.headers,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal,
      })
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > (options.maxResponseBytes ?? 512 * 1024))
        throw serviceError('protocolFailure', false)
      const parsed: unknown = bytes.length ? JSON.parse(Buffer.from(bytes).toString('utf8')) : null
      if (!response.ok) {
        const code =
          isRecord(parsed) && typeof parsed.code === 'string'
            ? normalizeCenterAuthErrorCode(parsed.code)
            : response.status >= 500
              ? 'centerUnavailable'
              : response.status === 401 || response.status === 403
                ? 'recoveryRequired'
                : 'protocolFailure'
        throw serviceError(code, code === 'centerUnavailable')
      }
      return parsed as T
    } catch (error) {
      if (isAbortError(error) && options.signal?.aborted) throw error
      if (isAbortError(error) || error instanceof TypeError)
        throw serviceError('centerUnavailable', true)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

function centerOrigin(): string | null {
  const value = process.env['TEA_CENTER_ORIGIN']
  if (!value) return process.env['NODE_ENV'] === 'production' ? null : 'http://127.0.0.1:8080'
  try {
    const url = new URL(value)
    const loopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
    if (
      !['https:', ...(process.env['NODE_ENV'] === 'production' ? [] : ['http:'])].includes(
        url.protocol,
      ) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol === 'http:' && !loopback)
    )
      return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLocaleLowerCase('en')
  return /^[a-z0-9](?:[a-z0-9.-]{0,252}[a-z0-9])?$/.test(normalized) ? normalized : null
}

function randomId(): string {
  return randomBytes(16).toString('hex')
}
function validSession(value: SessionResponse): boolean {
  return Boolean(
    value?.accessToken &&
    value.refreshCredential &&
    value.deviceId &&
    value.endpointSessionId &&
    Array.isArray(value.capabilities) &&
    value.capabilities.length <= 64,
  )
}
function errorCode(error: unknown): CenterAuthErrorCode {
  const value = error as { code?: unknown } | null
  return typeof value?.code === 'string'
    ? normalizeCenterAuthErrorCode(value.code)
    : 'protocolFailure'
}
function isCenterUnavailable(error: unknown): boolean {
  return errorCode(error) === 'centerUnavailable'
}
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneDirectoryResponse(users: DirectoryUser[]): {
  schemaVersion: 1
  users: DirectoryUser[]
} {
  return { schemaVersion: 1, users: structuredClone(users) }
}

export function normalizeDirectoryUsersResponse(
  value: unknown,
  expectedTenant?: { id: string; domain: string; displayName: string },
): { schemaVersion: 1; users: DirectoryUser[] } {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.users))
    throw serviceError('protocolFailure', false)
  if (value.users.length > 10_000) throw serviceError('protocolFailure', false)
  const users: DirectoryUser[] = []
  const centerIds = new Set<string>()
  const accounts = new Set<string>()
  for (const candidate of value.users) {
    if (!isRecord(candidate)) throw serviceError('protocolFailure', false)
    const tenant = readDirectoryTenant(candidate.tenant)
    const center = readDirectoryCenter(candidate.center)
    const oidc = readDirectoryOidc(candidate.oidc)
    const im = readDirectoryIm(candidate.im)
    if (
      expectedTenant &&
      (tenant.id !== expectedTenant.id || tenant.domain !== expectedTenant.domain)
    )
      throw serviceError('protocolFailure', false)
    if (centerIds.has(center.userId) || accounts.has(im.account))
      throw serviceError('protocolFailure', false)
    centerIds.add(center.userId)
    accounts.add(im.account)
    users.push({ tenant, center, oidc, im })
  }
  return { schemaVersion: 1, users }
}

function readDirectoryTenant(value: unknown): DirectoryUser['tenant'] {
  if (!isRecord(value)) throw serviceError('protocolFailure', false)
  const id = requiredDirectoryText(value.id, 128)
  const domain = requiredDirectoryText(value.domain, 253).toLocaleLowerCase('en')
  const displayName = requiredDirectoryText(value.displayName, 200)
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain))
    throw serviceError('protocolFailure', false)
  return { id, domain, displayName }
}

function readDirectoryCenter(value: unknown): DirectoryUser['center'] {
  if (!isRecord(value)) throw serviceError('protocolFailure', false)
  return {
    userId: requiredDirectoryText(value.userId, 128),
    displayName: requiredDirectoryText(value.displayName, 200),
  }
}

function readDirectoryOidc(value: unknown): DirectoryUser['oidc'] {
  if (!isRecord(value) || typeof value.emailVerified !== 'boolean')
    throw serviceError('protocolFailure', false)
  const avatarUrl = optionalDirectoryAvatar(value.avatarUrl)
  const email = optionalDirectoryText(value.email, 320)
  return {
    subject: requiredDirectoryText(value.subject, 512),
    preferredUsername: requiredDirectoryText(value.preferredUsername, 320),
    ...(email ? { email } : {}),
    emailVerified: value.emailVerified,
    ...(avatarUrl ? { avatarUrl } : {}),
  }
}

function readDirectoryIm(value: unknown): { provider: 'yunxin'; account: string; status: string } {
  if (!isRecord(value) || value.provider !== 'yunxin') throw serviceError('protocolFailure', false)
  return {
    provider: 'yunxin',
    account: requiredDirectoryText(value.account, 128),
    status: requiredDirectoryText(value.status, 64),
  }
}

function requiredDirectoryText(value: unknown, maximum: number): string {
  const result = optionalDirectoryText(value, maximum)
  if (!result) throw serviceError('protocolFailure', false)
  return result
}

function optionalDirectoryText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  if (!result || result.length > maximum || /[\u0000-\u001f\u007f]/.test(result)) return undefined
  return result
}

function optionalDirectoryAvatar(value: unknown): string | undefined {
  const result = optionalDirectoryText(value, 2_048)
  if (!result) return undefined
  try {
    const url = new URL(result)
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve) => server.close(() => resolve()))
}
function serviceError(
  code: string,
  retryable: boolean,
  message?: string,
): { code: string; retryable: boolean; message?: string } {
  return { code, retryable, ...(message ? { message } : {}) }
}
