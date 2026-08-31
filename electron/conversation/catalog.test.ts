import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import type { ChannelSourceInput } from '../../src/types/channelCollaboration'
import { ConversationCatalog, type ConversationCatalogRecord } from './catalog'

describe('ConversationCatalog', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('persists exact runtime identity without HostTool schemas or credentials', async () => {
    const filePath = await catalogPath()
    const first = new ConversationCatalog(filePath)
    await Promise.all([first.initialize(), first.initialize()])
    const value = record('conversation-1', 100, {
      channelBinding: {
        transportId: 'yunxin',
        accountRef: 'account-1',
        channelRef: 'channel-1',
      },
      hostTools: [{ name: 'tea.channel.history', version: '1' }],
    })

    expect(first.create(value)).toEqual(value)
    first.close()

    const second = new ConversationCatalog(filePath)
    await second.initialize()
    expect(second.get('conversation-1')).toEqual(value)
    expect(second.findByIdempotencyKey('create:conversation-1')).toEqual(value)
    second.close()

    const database = new DatabaseSync(filePath, { readOnly: true })
    const persisted = database
      .prepare('SELECT binding_json FROM runtime_conversations WHERE conversation_id = ?')
      .get('conversation-1')
    database.close()
    expect(JSON.stringify(persisted)).not.toContain('HostTool description must stay out of catalog')
    expect(JSON.stringify(persisted)).not.toContain('credential-value')
  })

  it('round-trips an optional working directory and keeps it absent for default sessions', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(record('default', 100))
    catalog.create(record('project', 101, { workingDirectory: '/projects/tea' }))

    expect(catalog.get('default')?.summary.workingDirectory).toBeUndefined()
    expect(catalog.get('project')?.summary.workingDirectory).toBe('/projects/tea')
    catalog.close()
  })

  it('enforces unique conversation and idempotency identities', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(record('conversation-1', 100))

    expect(() => catalog.create(record('conversation-1', 101))).toThrowError(
      expect.objectContaining({ code: 'conflict' }),
    )
    expect(() =>
      catalog.create({
        ...record('conversation-2', 102),
        idempotencyKey: 'create:conversation-1',
      }),
    ).toThrowError(expect.objectContaining({ code: 'conflict' }))
    catalog.close()
  })

  it('uses stable keyset pages and applies local and Channel filters', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(record('conversation-a', 200))
    catalog.create(
      record('conversation-b', 200, {
        channelBinding: {
          transportId: 'yunxin',
          accountRef: 'account-1',
          channelRef: 'channel-1',
        },
      }),
    )
    catalog.create(record('conversation-c', 300))

    const first = catalog.list({ limit: 2 })
    expect(first.items.map((item) => item.conversationId)).toEqual([
      'conversation-c',
      'conversation-b',
    ])
    expect(first).toMatchObject({ hasMore: true })
    expect(catalog.list({ limit: 2, cursor: first.nextCursor! })).toMatchObject({
      items: [{ conversationId: 'conversation-a' }],
      hasMore: false,
      nextCursor: null,
    })
    expect(
      catalog.list({ filter: { kind: 'local' } }).items.map((item) => item.conversationId),
    ).toEqual(['conversation-c', 'conversation-a'])
    expect(
      catalog
        .list({
          filter: {
            kind: 'binding',
            binding: {
              transportId: 'yunxin',
              accountRef: 'account-1',
              channelRef: 'channel-1',
            },
          },
        })
        .items.map((item) => item.conversationId),
    ).toEqual(['conversation-b'])
    catalog.close()
  })

  it('records only a bounded restore failure marker and clears it after success', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(record('conversation-1', 100))

    catalog.recordRestoreFailure('conversation-1', {
      code: 'unsupportedProtocolVersion',
      failedAt: 500,
    })
    expect(catalog.get('conversation-1')?.lastRestoreFailure).toEqual({
      code: 'unsupportedProtocolVersion',
      failedAt: 500,
    })
    catalog.clearRestoreFailure('conversation-1')
    expect(catalog.get('conversation-1')?.lastRestoreFailure).toBeUndefined()
    expect(() =>
      catalog.recordRestoreFailure('missing', { code: 'connectionFailed', failedAt: 501 }),
    ).toThrowError(expect.objectContaining({ code: 'unknownConversation' }))
    catalog.close()
  })

  it('persists explicit Channel turn selections and appends deduplicated tool evidence', async () => {
    const filePath = await catalogPath()
    const first = new ConversationCatalog(filePath)
    await first.initialize()
    first.create(
      record('conversation-1', 100, {
        channelBinding: {
          transportId: 'yunxin',
          accountRef: 'account-1',
          channelRef: 'channel-1',
        },
      }),
    )

    const initial = first.createTurnContext(
      'conversation-1',
      'Summarize the decision',
      [channelSource('message-1', 'One'), channelSource('message-1', 'Duplicate')],
      200,
    )
    const explicitEmpty = first.createTurnContext('conversation-1', 'Continue', [], 201)
    expect(initial).toMatchObject({ turnIndex: 0, visibleText: 'Summarize the decision' })
    expect(initial.sources).toHaveLength(1)
    expect(explicitEmpty).toMatchObject({ turnIndex: 1, sources: [] })
    const sameWithoutServerId = channelSource('message-1', 'Duplicate without server id')
    delete sameWithoutServerId.messageRef.messageServerId
    expect(first.appendTurnSources('conversation-1', 0, [sameWithoutServerId])).toEqual([])
    expect(
      first.appendTurnSources('conversation-1', 0, [
        channelSource('message-2', 'Two'),
        channelSource('message-2', 'Duplicate tool result'),
      ]),
    ).toMatchObject([{ turnIndex: 0, origin: 'agentTool', text: 'Two' }])
    first.close()

    const reopened = new ConversationCatalog(filePath)
    await reopened.initialize()
    expect(reopened.collaborationSnapshot('conversation-1')).toMatchObject({
      turnContexts: [
        {
          turnIndex: 0,
          visibleText: 'Summarize the decision',
          sources: [{ origin: 'userForwarded' }, { origin: 'agentTool' }],
        },
        { turnIndex: 1, visibleText: 'Continue', sources: [] },
      ],
      drafts: [],
      deliveries: [],
    })
    reopened.removeTurnContext('conversation-1', 0)
    expect(reopened.collaborationSnapshot('conversation-1').turnContexts).toEqual([
      expect.objectContaining({ turnIndex: 1, sources: [] }),
    ])
    reopened.close()
  })

  it('rejects unbound, wrong-Channel, and oversized collaboration input', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()
    catalog.create(record('local', 100))
    catalog.create(
      record('bound', 100, {
        channelBinding: {
          transportId: 'yunxin',
          accountRef: 'account-1',
          channelRef: 'channel-1',
        },
      }),
    )

    expect(() => catalog.createTurnContext('local', 'Prompt', [], 200)).toThrowError(
      expect.objectContaining({ code: 'invalidRequest' }),
    )
    const wrongChannel = channelSource('message-1', 'One')
    wrongChannel.messageRef.channelRef = 'channel-2'
    expect(() => catalog.createTurnContext('bound', 'Prompt', [wrongChannel], 200)).toThrowError(
      expect.objectContaining({ code: 'invalidRequest' }),
    )
    expect(() =>
      catalog.createTurnContext(
        'bound',
        'Prompt',
        Array.from({ length: 9 }, (_, index) =>
          channelSource(`message-${index}`, 'x'.repeat(4_000)),
        ),
        200,
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidRequest' }))
    catalog.close()
  })

  it('persists versioned drafts and idempotent delivery state transitions', async () => {
    const filePath = await catalogPath()
    const catalog = new ConversationCatalog(filePath)
    await catalog.initialize()
    catalog.create(
      record('conversation-1', 100, {
        channelBinding: {
          transportId: 'yunxin',
          accountRef: 'account-1',
          channelRef: 'channel-1',
        },
      }),
    )
    catalog.createTurnContext('conversation-1', 'Draft a reply', [], 150)

    const created = catalog.createDraft('conversation-1', 0, 'assistant-block-1', 'First', 200)
    const updated = catalog.updateDraft(created.draftId, 'Second', 201)
    expect(updated).toMatchObject({ currentVersion: 2, content: 'Second', updatedAt: 201 })

    const pending = catalog.prepareDelivery(created.draftId, 202)
    expect(catalog.prepareDelivery(created.draftId, 203)).toEqual(pending)
    expect(() =>
      catalog.updateDelivery(pending.deliveryId, 'sent', 204, {
        channelRef: 'channel-1',
        messageClientId: 'sent-1',
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalidRequest' }))

    const sending = catalog.updateDelivery(pending.deliveryId, 'sending', 204)
    const failed = catalog.updateDelivery(
      pending.deliveryId,
      'failed',
      205,
      undefined,
      'deliveryUncertain',
    )
    expect(sending).toMatchObject({ status: 'sending' })
    expect(failed).toMatchObject({ status: 'failed', failureCode: 'deliveryUncertain' })
    catalog.updateDelivery(pending.deliveryId, 'sending', 206)
    const sent = catalog.updateDelivery(pending.deliveryId, 'sent', 207, {
      channelRef: 'channel-1',
      messageClientId: 'sent-1',
      messageServerId: 'server-sent-1',
    })
    expect(sent).toMatchObject({ status: 'sent', sentMessageRef: { messageClientId: 'sent-1' } })
    expect(() =>
      catalog.updateDelivery(pending.deliveryId, 'failed', 208, undefined, 'lateFailure'),
    ).toThrowError(expect.objectContaining({ code: 'invalidRequest' }))
    catalog.close()

    const reopened = new ConversationCatalog(filePath)
    await reopened.initialize()
    expect(reopened.collaborationSnapshot('conversation-1')).toMatchObject({
      drafts: [{ draftId: created.draftId, currentVersion: 2, content: 'Second' }],
      deliveries: [
        {
          deliveryId: pending.deliveryId,
          draftVersion: 2,
          status: 'sent',
          sentMessageRef: { messageClientId: 'sent-1', messageServerId: 'server-sent-1' },
        },
      ],
    })
    reopened.close()
  })

  it('rejects unsupported schema versions without replacing the database', async () => {
    const filePath = await catalogPath()
    const database = new DatabaseSync(filePath)
    database.exec('PRAGMA user_version = 9')
    database.close()

    const catalog = new ConversationCatalog(filePath)
    await expect(catalog.initialize()).rejects.toMatchObject({
      code: 'unsupportedSchema',
      retryable: false,
    })

    const preserved = new DatabaseSync(filePath)
    expect(preserved.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 9 })
    preserved.close()
  })

  it('rejects a malformed stored binding instead of returning partial identity', async () => {
    const filePath = await catalogPath()
    const catalog = new ConversationCatalog(filePath)
    await catalog.initialize()
    catalog.create(record('conversation-1', 100))
    catalog.close()

    const database = new DatabaseSync(filePath)
    database
      .prepare('UPDATE runtime_conversations SET binding_json = ? WHERE conversation_id = ?')
      .run('{"schemaVersion":1}', 'conversation-1')
    database.close()

    const reopened = new ConversationCatalog(filePath)
    await reopened.initialize()
    expect(() => reopened.get('conversation-1')).toThrowError(
      expect.objectContaining({ code: 'corruptCatalog' }),
    )
    reopened.close()
  })

  it('rejects invalid pagination and access after close with stable codes', async () => {
    const catalog = new ConversationCatalog(await catalogPath())
    await catalog.initialize()

    expect(() => catalog.list({ limit: 0 })).toThrowError(
      expect.objectContaining({ code: 'invalidRequest' }),
    )
    expect(() => catalog.list({ cursor: 'not-json' })).toThrowError(
      expect.objectContaining({ code: 'invalidRequest' }),
    )
    catalog.close()
    catalog.close()
    expect(() => catalog.get('conversation-1')).toThrowError(
      expect.objectContaining({ code: 'shutDown' }),
    )
  })

  async function catalogPath(): Promise<string> {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runtime-catalog-'))
    temporaryDirectories.push(directory)
    return path.join(directory, 'conversation-catalog.sqlite3')
  }
})

function channelSource(messageClientId: string, text: string): ChannelSourceInput {
  return {
    messageRef: {
      channelRef: 'channel-1',
      messageClientId,
      messageServerId: `server-${messageClientId}`,
    },
    senderName: 'Lin',
    sentAt: 10,
    sentByCurrentUser: false,
    text,
    capturedAt: 20,
    state: 'active',
  }
}

function record(
  conversationId: string,
  updatedAt: number,
  options: {
    channelBinding?: ConversationCatalogRecord['summary']['channelBinding']
    hostTools?: ConversationCatalogRecord['binding']['hostTools']
    workingDirectory?: string
  } = {},
): ConversationCatalogRecord {
  const nativeSessionId = `session:${conversationId}`
  const runtimeId = 'external.test'
  return {
    summary: {
      conversationId,
      runtimeId,
      workspaceId: 'workspace-1',
      ...(options.workingDirectory ? { workingDirectory: options.workingDirectory } : {}),
      createdAt: 100,
      updatedAt,
      ...(options.channelBinding ? { channelBinding: options.channelBinding } : {}),
    },
    nativeSessionId,
    idempotencyKey: `create:${conversationId}`,
    binding: {
      schemaVersion: 1,
      runtimeId,
      nativeSessionId,
      implementation: { kind: 'acp', id: 'agent.test', revision: 1 },
      protocol: { name: 'acp', version: 2 },
      artifact: {
        packageName: '@agentclientprotocol/test-agent',
        version: '1.0.0',
        integrity: 'sha512-synthetic',
      },
      workspacePath: options.workingDirectory ?? '/workspace',
      hostTools: options.hostTools ?? [],
    },
  }
}
