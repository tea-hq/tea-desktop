import { describe, expect, it, vi } from 'vitest'
import {
  cloudConversationToSummary,
  TeaCenterCloudRunnerClient,
  toCloudConversationRequest,
} from './cloudRunnerClient'

describe('TeaCenterCloudRunnerClient', () => {
  it('sends endpoint credentials and idempotency keys', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ tag: 'gpu', available: 1, busy: 0, scope: 'tenant' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test/',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })
    await expect(client.listRunnerTags()).resolves.toEqual([
      { tag: 'gpu', available: 1, busy: 0, scope: 'tenant' },
    ])
    expect(fetcher).toHaveBeenCalledWith(
      'https://center.test/v1/cloud/runner-tags',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    )
  })

  it('refreshes the main-process access token once after an unauthorized response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'expired-token',
      refreshAccessToken: () => 'fresh-token',
      fetch: fetcher,
    })

    await expect(client.listRunnerTags()).resolves.toEqual([])
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://center.test/v1/cloud/runner-tags',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    )
  })

  it('preserves the Center error message and code for failed requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 'pending', message: 'no runner is available' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await expect(client.listConversations()).rejects.toMatchObject({
      message: 'no runner is available',
      code: 'pending',
      retryable: true,
    })
  })

  it('normalizes network failures as retryable Center-unavailable errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('failed to fetch'))
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await expect(client.listRunnerTags()).rejects.toMatchObject({
      code: 'centerUnavailable',
      retryable: true,
      message: 'Tea Center is unavailable',
    })
  })

  it('classifies an unstructured server failure as Center unavailable', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>upstream unavailable</html>', { status: 502 }))
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await expect(client.listRunnerTags()).rejects.toMatchObject({
      code: 'centerUnavailable',
      retryable: true,
      message: 'Tea Center request failed: 502',
    })
  })

  it('reports malformed successful responses as protocol failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await expect(client.listRunnerTags()).rejects.toMatchObject({
      code: 'protocolFailure',
      retryable: false,
      message: 'Tea Center returned an invalid response',
    })
  })

  it('posts cloud permission decisions to the conversation approval endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 202 }))
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await client.respondToApproval('cloud/1', 'approval/1', 'allowOnce')

    expect(fetcher).toHaveBeenCalledWith(
      'https://center.test/v1/cloud/conversations/cloud%2F1/approvals/approval%2F1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'allowOnce' }),
      }),
    )
  })

  it('maps an immutable cloud execution selection', () => {
    expect(
      toCloudConversationRequest({
        target: 'cloud',
        runtimeId: 'acp.codex',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        tags: ['gpu'],
      }),
    ).toEqual({
      executionTarget: 'cloud',
      runtimeId: 'acp.codex',
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      tags: ['gpu'],
    })
    expect(() =>
      toCloudConversationRequest({ target: 'cloud', runtimeId: 'acp.codex', tags: [] }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalidRequest',
        message: 'cloud runtime, provider, model and tags are required',
      }),
    )
  })

  it('projects cloud catalog records into the shared conversation list shape', () => {
    const summary = cloudConversationToSummary({
      conversationId: 'conversation-1',
      ownerSubjectId: 'user-1',
      tenantId: 'tenant-1',
      executionTarget: 'cloud',
      tags: ['linux'],
      runtimeId: 'acp.codex',
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      status: 'running',
      workspaceRef: 'workspace-1',
      assignmentEpoch: 1,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:01:00Z',
    })
    expect(summary.source).toBe('cloud')
    expect(summary.runnerTags).toEqual(['linux'])
  })

  it('builds an npx one-command registration script from the selected visible token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            tokenId: 'runner-token-tenant',
            scope: 'tenant',
            scopeId: 'tenant/acme',
            secret: 'tea-runner-secret',
            createdAt: '2026-09-01T00:00:00Z',
          },
          {
            tokenId: 'runner-token-user',
            scope: 'user',
            scopeId: 'user-1',
            secret: 'tea-runner-user-secret',
            createdAt: '2026-09-01T00:00:00Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test/',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    const command = await client.createRunnerRegistrationCommand({
      tokenId: 'runner-token-tenant',
    })

    expect(command).toMatchObject({
      tokenId: 'runner-token-tenant',
      scope: 'tenant',
      scopeId: 'tenant/acme',
      centerUrl: 'https://center.test',
    })
    expect(command.command).toContain('npx --yes @tea/runner register')
    expect(command.command).toContain("--token 'tea-runner-secret'")
    expect(command.command).toContain('--install-service')
    expect(command.command).not.toContain("'tea-runner' register")
    expect(command.command).not.toContain('--scope')
    expect(command.command).not.toContain('--name')
    expect(command.command).not.toContain('--tag')
    expect(command.command).not.toContain('TEA_RUNNER_TOKEN')
  })

  it('selects a tenant token by default without exposing token scope as a CLI option', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            tokenId: 'runner-token-user',
            scope: 'user',
            scopeId: 'user-1',
            secret: 'user-secret',
            createdAt: '2026-09-02T00:00:00Z',
          },
          {
            tokenId: 'runner-token-tenant',
            scope: 'tenant',
            scopeId: 'tenant/acme',
            secret: 'tenant-secret',
            createdAt: '2026-09-01T00:00:00Z',
          },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await expect(client.createRunnerRegistrationCommand()).resolves.toMatchObject({
      tokenId: 'runner-token-tenant',
      scope: 'tenant',
    })
  })

  it('fails clearly when the selected token is not visible or active', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new TeaCenterCloudRunnerClient({
      baseUrl: 'https://center.test',
      accessToken: () => 'access-token',
      fetch: fetcher,
    })

    await expect(
      client.createRunnerRegistrationCommand({ tokenId: 'missing-token' }),
    ).rejects.toThrow('active runner token is unavailable')
  })
})
