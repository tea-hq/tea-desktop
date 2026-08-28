import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { channelHistoryToolDefinition } from '../../src/features/conversation/hostToolCatalog'
import { createElectronConversationHost, RuntimeHostToolCatalog } from './host'

describe('RuntimeHostToolCatalog', () => {
  it('resolves exact main-owned definitions and rejects unknown versions', async () => {
    const catalog = new RuntimeHostToolCatalog([channelHistoryToolDefinition])

    await expect(
      catalog.resolve([
        { name: channelHistoryToolDefinition.name, version: channelHistoryToolDefinition.version },
      ]),
    ).resolves.toEqual([channelHistoryToolDefinition])
    await expect(
      catalog.resolve([{ name: channelHistoryToolDefinition.name, version: '2.0.0' }]),
    ).rejects.toMatchObject({ code: 'notConfigured' })
  })
})

describe('ElectronConversationHost', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    )
  })

  it('owns ready runtime commands, durable catalog initialization, and idempotent shutdown', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-conversation-host-'))
    directories.push(directory)
    const host = await createElectronConversationHost({
      catalogPath: path.join(directory, 'catalog.sqlite3'),
      workspaceId: 'desktop-workspace',
      workspacePath: '/workspace',
      hostTools: [channelHistoryToolDefinition],
      events: {
        conversationEvent: vi.fn(),
        conversationUpdated: vi.fn(),
        hostToolCall: vi.fn(),
      },
      registry: {
        artifactResolver: {
          resolve: vi.fn(async (definition) => ({
            definition,
            packageRoot: '/package',
            packageJsonPath: '/package/package.json',
            entrypointPath: '/package/dist/index.js',
          })),
        },
      },
    })
    await host.initialize()

    await expect(host.commands.listRuntimes()).resolves.toEqual([
      expect.objectContaining({ id: 'external.claude', status: 'ready' }),
      expect.objectContaining({ id: 'external.codex', status: 'ready' }),
    ])
    await host.shutdown()
    await host.shutdown()
  })
})
