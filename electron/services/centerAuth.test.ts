import { generateKeyPairSync, verify, type KeyObject } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CenterAuthState, EndpointBootstrap } from '../../src/features/auth/contracts'
import { ElectronCenterAuthService } from './centerAuth'

const electron = vi.hoisted(() => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8')),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
  },
  shell: { openExternal: vi.fn() },
}))

vi.mock('electron', () => electron)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ElectronCenterAuthService', () => {
  it('refreshes a cached session with the canonical device-proof payload', async () => {
    const fixture = await authFixture()
    const states: CenterAuthState[] = []
    let refreshProofVerified = false
    const rotatedRefresh = refreshCredential(fixture.publicKey, 2)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const endpoint = new URL(String(input)).pathname
        if (endpoint === '/v1/endpoint-sessions/refresh') {
          const body = JSON.parse(String(init?.body)) as RefreshRequest
          refreshProofVerified = verify(
            null,
            Buffer.from(`tea-center-refresh-v1\n${fixture.refresh}`, 'utf8'),
            fixture.publicKeyObject,
            Buffer.from(body.deviceProof.signature, 'base64url'),
          )
          if (!refreshProofVerified)
            return jsonResponse(403, { code: 'authorization_denied', message: 'denied' })
          expect(body.deviceProof).toMatchObject({
            algorithm: 'ed25519',
            keyId: fixture.publicKey,
          })
          return jsonResponse(200, sessionResponse(rotatedRefresh))
        }
        if (endpoint === '/v1/endpoint/bootstrap') return jsonResponse(200, fixture.bootstrap)
        throw new Error(`unexpected Center endpoint: ${endpoint}`)
      }),
    )
    const service = new ElectronCenterAuthService(fixture.filePath, (state) => states.push(state))

    const initialized = await service.initialize()

    expect(refreshProofVerified).toBe(true)
    expect(states.map((state) => state.phase)).toEqual(['offlineCached', 'authenticated'])
    expect(initialized.state).toMatchObject({
      phase: 'authenticated',
      bootstrap: fixture.bootstrap,
      errorCode: null,
    })
    const stored = await storedAuthFile(fixture.filePath)
    expect(
      electron.safeStorage.decryptString(Buffer.from(stored.encryptedRefresh!, 'base64')),
    ).toBe(rotatedRefresh)
    expect(stored.cachedState?.phase).toBe('authenticated')
  })

  it('normalizes authorization denial and invalidates the cached session', async () => {
    const fixture = await authFixture()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(403, { code: 'authorization_denied', message: 'authorization denied' }),
      ),
    )
    const service = new ElectronCenterAuthService(fixture.filePath, () => undefined)

    const initialized = await service.initialize()

    expect(initialized.state).toMatchObject({
      phase: 'recoveryRequired',
      bootstrap: null,
      errorCode: 'authorizationDenied',
    })
    const stored = await storedAuthFile(fixture.filePath)
    expect(stored.encryptedRefresh).toBeUndefined()
    expect(stored.cachedState).toBeUndefined()
  })

  it('caches directory users within the TTL and honors force refresh', async () => {
    const fixture = await authFixture()
    let clock = 1_000
    let directoryCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const endpoint = new URL(String(input)).pathname
        if (endpoint === '/v1/endpoint-sessions/refresh')
          return jsonResponse(200, sessionResponse(refreshCredential(fixture.publicKey, 2)))
        if (endpoint === '/v1/endpoint/bootstrap') return jsonResponse(200, fixture.bootstrap)
        if (endpoint === '/v1/endpoint/directory/users') {
          directoryCalls += 1
          return jsonResponse(200, { schemaVersion: 1, users: [directoryUser()] })
        }
        throw new Error(`unexpected Center endpoint: ${endpoint}`)
      }),
    )
    const service = new ElectronCenterAuthService(
      fixture.filePath,
      () => undefined,
      () => clock,
    )
    await service.initialize()

    await service.listDirectoryUsers()
    await service.listDirectoryUsers()
    expect(directoryCalls).toBe(1)

    clock += 30_000
    await service.listDirectoryUsers()
    expect(directoryCalls).toBe(2)

    await service.listDirectoryUsers({ forceRefresh: true })
    expect(directoryCalls).toBe(3)
  })

  it('merges concurrent directory requests and does not leak a failed response into cache', async () => {
    const fixture = await authFixture()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let directoryCalls = 0
    let fail = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const endpoint = new URL(String(input)).pathname
        if (endpoint === '/v1/endpoint-sessions/refresh')
          return jsonResponse(200, sessionResponse(refreshCredential(fixture.publicKey, 2)))
        if (endpoint === '/v1/endpoint/bootstrap') return jsonResponse(200, fixture.bootstrap)
        if (endpoint === '/v1/endpoint/directory/users') {
          directoryCalls += 1
          await gate
          if (fail) return jsonResponse(503, { code: 'centerUnavailable' })
          return jsonResponse(200, { schemaVersion: 1, users: [directoryUser()] })
        }
        throw new Error(`unexpected Center endpoint: ${endpoint}`)
      }),
    )
    const service = new ElectronCenterAuthService(fixture.filePath, () => undefined)
    await service.initialize()

    const first = service.listDirectoryUsers({ forceRefresh: true })
    const second = service.listDirectoryUsers({ forceRefresh: true })
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { schemaVersion: 1, users: [directoryUser()] },
      { schemaVersion: 1, users: [directoryUser()] },
    ])
    expect(directoryCalls).toBe(1)

    fail = true
    await expect(service.listDirectoryUsers({ forceRefresh: true })).rejects.toMatchObject({
      code: 'centerUnavailable',
    })
    expect(directoryCalls).toBe(2)
    await expect(service.listDirectoryUsers()).resolves.toEqual({
      schemaVersion: 1,
      users: [directoryUser()],
    })
    expect(directoryCalls).toBe(2)
  })
})

interface RefreshRequest {
  refreshCredential: string
  deviceProof: { algorithm: string; keyId: string; signature: string }
}

interface StoredAuthFile {
  endpointInstanceId: string
  publicKey: string
  encryptedPrivateKey?: string
  encryptedRefresh?: string
  cachedState?: CenterAuthState
}

async function authFixture(): Promise<{
  filePath: string
  publicKey: string
  publicKeyObject: KeyObject
  refresh: string
  bootstrap: EndpointBootstrap
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-center-auth-'))
  const filePath = path.join(directory, 'center-auth.json')
  const pair = generateKeyPairSync('ed25519')
  const publicDer = pair.publicKey.export({ type: 'spki', format: 'der' })
  const publicKey = publicDer.subarray(-32).toString('base64url')
  const refresh = refreshCredential(publicKey, 1)
  const bootstrap = endpointBootstrap()
  const cachedState: CenterAuthState = {
    generation: 0,
    phase: 'authenticated',
    enterprise: {
      organizationDomain: bootstrap.tenant.domain,
      displayName: bootstrap.tenant.displayName,
      loginAvailable: true,
    },
    bootstrap,
    lastValidatedAt: 1_788_048_000_000,
    errorCode: null,
  }
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  await writeFile(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      data: {
        endpointInstanceId: 'endpoint-instance-1',
        publicKey,
        encryptedPrivateKey: Buffer.from(privateKey, 'utf8').toString('base64'),
        encryptedRefresh: Buffer.from(refresh, 'utf8').toString('base64'),
        cachedState,
      },
    }),
  )
  return { filePath, publicKey, publicKeyObject: pair.publicKey, refresh, bootstrap }
}

function endpointBootstrap(): EndpointBootstrap {
  return {
    schemaVersion: 1,
    revision: 3,
    generatedAt: '2026-08-30T02:00:00.000Z',
    tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example' },
    user: {
      id: 'user-1',
      displayName: 'Example User',
      preferredUsername: 'example',
      email: 'example@example.test',
      emailVerified: true,
      avatarUrl: '',
      oidcSubject: 'oidc-subject-1',
    },
    im: null,
    modelProviders: [],
  }
}

function refreshCredential(publicKey: string, seed: number): string {
  return `v1.${Buffer.alloc(32, seed).toString('base64url')}.${publicKey}`
}

function sessionResponse(refresh: string) {
  return {
    accessToken: 'access-token-1',
    accessTokenExpiresAt: '2026-08-30T02:15:00.000Z',
    refreshCredential: refresh,
    refreshExpiresAt: '2026-09-29T02:00:00.000Z',
    deviceId: 'device-1',
    endpointSessionId: 'endpoint-session-1',
    capabilities: ['tasks.read', 'tasks.command'],
  }
}

function directoryUser() {
  return {
    tenant: { id: 'tenant-1', domain: 'example.test', displayName: 'Example' },
    center: { userId: 'user-2', displayName: 'Directory User' },
    oidc: {
      subject: 'oidc-user-2',
      preferredUsername: 'directory-user',
      email: 'directory@example.test',
      emailVerified: true,
    },
    im: { provider: 'yunxin', account: 'yunxin-user-2', status: 'ready' },
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function storedAuthFile(filePath: string): Promise<StoredAuthFile> {
  const stored = JSON.parse(await readFile(filePath, 'utf8')) as {
    schemaVersion: number
    data: StoredAuthFile
  }
  expect(stored.schemaVersion).toBe(1)
  return stored.data
}
