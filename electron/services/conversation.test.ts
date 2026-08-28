import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HostToolCall } from '../../src/features/conversation/contracts'
import { ElectronConversationService } from './conversation'

describe('ElectronConversationService', () => {
  const previousCodexExecutable = process.env['TEA_CODEX_EXECUTABLE']
  const previousCodexLog = process.env['CODEX_TEST_LOG']

  beforeEach(() => {
    process.env['TEA_CLAUDE_EXECUTABLE'] = process.execPath
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousCodexExecutable === undefined) delete process.env['TEA_CODEX_EXECUTABLE']
    else process.env['TEA_CODEX_EXECUTABLE'] = previousCodexExecutable
    if (previousCodexLog === undefined) delete process.env['CODEX_TEST_LOG']
    else process.env['CODEX_TEST_LOG'] = previousCodexLog
  })

  it('exposes only external runtimes', async () => {
    const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'tea-runtimes-')), 'state.json')
    const service = createService(filePath, [])
    await service.initialize()

    expect(service.listRuntimes().map((runtime) => runtime.id)).toEqual([
      'external.claude',
      'external.codex',
    ])
    expect(service.listRuntimes().every((runtime) => runtime.kind === 'externalCli')).toBe(true)
  })

  it('persists conversation summaries and honors creation idempotency', async () => {
    const filePath = path.join(
      await mkdtemp(path.join(os.tmpdir(), 'tea-conversations-')),
      'state.json',
    )
    const updates: string[] = []
    const first = createService(filePath, updates)
    await first.initialize()

    const created = await first.createConversation('external.claude', 'test:create')
    const duplicate = await first.createConversation('external.claude', 'test:create')

    expect(duplicate).toEqual(created)
    expect(updates).toContain(created.handle.conversationId)

    const restored = createService(filePath, [])
    await restored.initialize()
    await expect(restored.listConversations({ limit: 10 })).resolves.toMatchObject({
      items: [{ conversationId: created.handle.conversationId }],
      hasMore: false,
    })
  })

  it('keeps draft delivery transitions bound to the conversation binding', async () => {
    const filePath = path.join(
      await mkdtemp(path.join(os.tmpdir(), 'tea-collaboration-')),
      'state.json',
    )
    const service = createService(filePath, [])
    await service.initialize()
    const created = await service.createConversation('external.claude', 'test:binding', {
      transportId: 'yunxin.web',
      accountRef: 'account-ref',
      channelRef: 'channel-ref',
    })

    const draft = await service.createDraft(
      created.handle.conversationId,
      0,
      'block-1',
      'Reply to the Channel',
    )
    const updated = await service.updateDraft(draft.draftId, 'Updated reply')
    const delivery = await service.prepareDelivery(draft.draftId)
    const sending = await service.updateDelivery(delivery.deliveryId, 'sending')
    const sent = await service.updateDelivery(sending.deliveryId, 'sent', {
      channelRef: 'channel-ref',
      messageClientId: 'client-message',
    })

    expect(updated.currentVersion).toBe(2)
    expect(sent.status).toBe('sent')
    expect(sent.draftVersion).toBe(2)
    await expect(service.getConversation(created.handle.conversationId)).resolves.toMatchObject({
      collaboration: { drafts: [{ content: 'Updated reply' }], deliveries: [{ status: 'sent' }] },
    })
  })

  it('uses a persistent Codex app-server thread and resumes it after restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-codex-'))
    const executable = path.join(directory, 'fake-codex.mjs')
    const logPath = path.join(directory, 'requests.log')
    await writeFile(
      executable,
      `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import readline from 'node:readline'

let turnNumber = 0
const logPath = process.env.CODEX_TEST_LOG
const output = value => process.stdout.write(JSON.stringify(value) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
for await (const line of rl) {
  const request = JSON.parse(line)
  appendFileSync(logPath, JSON.stringify(request) + '\\n')
  if (request.method === 'initialize') output({ id: request.id, result: {} })
  else if (request.method === 'initialized') continue
  else if (request.method === 'thread/start') output({ id: request.id, result: { thread: { id: 'thread-1' } } })
  else if (request.method === 'thread/resume') output({ id: request.id, result: { thread: { id: request.params.threadId } } })
  else if (request.method === 'turn/start') {
    turnNumber += 1
    const turnId = 'turn-' + turnNumber
    output({ id: request.id, result: { turn: { id: turnId } } })
    output({ method: 'item/agentMessage/delta', params: { threadId: request.params.threadId, delta: 'Codex answer ' + turnNumber } })
    output({ method: 'turn/completed', params: { threadId: request.params.threadId, turn: { id: turnId, status: 'completed' } } })
  }
}
`,
      { encoding: 'utf8', mode: 0o700 },
    )
    await chmod(executable, 0o700)
    process.env['TEA_CODEX_EXECUTABLE'] = executable
    process.env['CODEX_TEST_LOG'] = logPath

    const statePath = path.join(directory, 'state.json')
    const firstEvents: string[] = []
    const first = new ElectronConversationService(
      statePath,
      process.cwd(),
      (event) => firstEvents.push(event.event.type),
      () => undefined,
      () => undefined,
    )
    await first.initialize()
    const created = await first.createConversation('external.codex', 'codex:create')
    await first.send(created.handle.conversationId, 'First request', {
      model: 'default',
      permissionMode: 'default',
    })
    await first.send(created.handle.conversationId, 'Second request', {
      model: 'default',
      permissionMode: 'default',
    })
    await first.shutdown()

    const log = (await readFile(logPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(log.filter((request) => request.method === 'thread/start')).toHaveLength(1)
    expect(log.filter((request) => request.method === 'thread/resume')).toHaveLength(0)
    expect(firstEvents.filter((type) => type === 'messageDelta')).toHaveLength(2)

    const secondEvents: string[] = []
    const second = new ElectronConversationService(
      statePath,
      process.cwd(),
      (event) => secondEvents.push(event.event.type),
      () => undefined,
      () => undefined,
    )
    await second.initialize()
    await second.send(created.handle.conversationId, 'After restart', {
      model: 'default',
      permissionMode: 'default',
    })
    await second.shutdown()

    const resumedLog = (await readFile(logPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(resumedLog.filter((request) => request.method === 'thread/resume')).toHaveLength(1)
    expect(secondEvents).toEqual(expect.arrayContaining(['messageDelta', 'runFinished']))
  })
})

function createService(
  filePath: string,
  updates: string[],
  emitHostToolCall: (call: HostToolCall) => void = () => undefined,
): ElectronConversationService {
  return new ElectronConversationService(
    filePath,
    process.cwd(),
    () => undefined,
    (summary) => updates.push(summary.conversationId),
    emitHostToolCall,
  )
}
