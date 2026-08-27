import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  ApprovalDecision,
  ConversationDetail,
  ConversationEvent,
  ConversationHistoryPage,
  ConversationPage,
  ConversationSummary,
  ConversationTurn,
  HostToolCall,
  HostToolResult,
  ListConversationsRequest,
  LoadConversationHistoryRequest,
  RuntimeDescriptor,
  SendMessageOptions,
} from './contracts'
import type { ChannelSourceInput, MessageRef } from '@/types/channelCollaboration'
import { mergeHistoryTurns, useConversationStore } from './store'

const runtime: RuntimeDescriptor = {
  id: 'builtin.tea',
  kind: 'builtInTea',
  displayName: 'Tea Agent',
  capabilities: ['prompt', 'cancel', 'events', 'snapshot', 'history'],
  status: 'ready',
}

class FakeClient {
  private runtimes: RuntimeDescriptor[] = []
  private handlers: Map<string, Set<(e: ConversationEvent) => void>> = new Map()
  private updateHandlers = new Set<(summary: ConversationSummary) => void>()
  pages: ConversationPage[] = []
  detailPromises = new Map<string, Promise<ConversationDetail>>()
  historyPages = new Map<string, Array<ConversationHistoryPage | Error>>()
  getConversationCalls: string[] = []
  subscriptionCalls: string[] = []
  createCalls = 0
  sendCalls = 0
  cancelCalls = 0
  approvalCalls: Array<{ conversationId: string; approvalId: string; decision: ApprovalDecision }> = []
  approvalError: Error | null = null
  lastSendOptions: SendMessageOptions | null = null
  createSummary: ConversationSummary | null | undefined

  setRuntimes(r: RuntimeDescriptor[]): void {
    this.runtimes = r
  }

  async listRuntimes(): Promise<RuntimeDescriptor[]> {
    return structuredClone(this.runtimes)
  }

  async listConversations(_request: ListConversationsRequest): Promise<ConversationPage> {
    return structuredClone(this.pages.shift() ?? { items: [], nextCursor: null, hasMore: false })
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    this.getConversationCalls.push(conversationId)
    const pending = this.detailPromises.get(conversationId)
    if (pending) return pending
    const summary = summaryFor(conversationId, 1)
    return { summary, collaboration: emptyCollaboration() }
  }

  async loadConversationHistory(request: LoadConversationHistoryRequest): Promise<ConversationHistoryPage> {
    const result = this.historyPages.get(request.conversationId)?.shift()
    if (result instanceof Error) throw result
    return structuredClone(result ?? { items: [], nextCursor: null, hasMore: false, startIndex: 0 })
  }

  async createConversation(runtimeId: string) {
    this.createCalls++
    const handle = { conversationId: `conv-${this.createCalls}`, runtimeId }
    return {
      handle,
      summary: this.createSummary === undefined
        ? summaryFor(handle.conversationId, Date.now())
        : this.createSummary,
    }
  }

  async renameConversation(_conversationId: string, _title: string): Promise<void> {}
  async archiveConversation(_conversationId: string): Promise<void> {}
  async deleteConversation(_conversationId: string): Promise<void> {}
  async configureHostTools(): Promise<void> {}
  async appendConversationSources(
    _conversationId: string,
    _turnIndex: number,
    _sources: ChannelSourceInput[],
  ): Promise<never[]> { return [] }
  async createDraft(): Promise<never> { throw new Error('not implemented') }
  async updateDraft(): Promise<never> { throw new Error('not implemented') }
  async prepareDelivery(): Promise<never> { throw new Error('not implemented') }
  async markDeliverySending(): Promise<never> { throw new Error('not implemented') }
  async completeDelivery(_deliveryId: string, _ref: MessageRef): Promise<never> { throw new Error('not implemented') }
  async failDelivery(): Promise<never> { throw new Error('not implemented') }

  async sendMessage(_conversationId: string, _text: string, options: SendMessageOptions): Promise<void> {
    this.sendCalls++
    this.lastSendOptions = options
  }

  async cancelConversation(_conversationId: string): Promise<void> {
    this.cancelCalls++
  }

  async respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    this.approvalCalls.push({ conversationId, approvalId, decision })
    if (this.approvalError) throw this.approvalError
  }

  async resolveHostToolCall(_result: HostToolResult): Promise<void> {}

  async subscribeToEvents(conversationId: string, handler: (e: ConversationEvent) => void): Promise<() => void> {
    this.subscriptionCalls.push(conversationId)
    let set = this.handlers.get(conversationId)
    if (!set) {
      set = new Set()
      this.handlers.set(conversationId, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  async subscribeToHostToolCalls(_conversationId: string, _handler: (call: HostToolCall) => void): Promise<() => void> {
    return () => undefined
  }

  subscribeToConversationUpdates(handler: (summary: ConversationSummary) => void): () => void {
    this.updateHandlers.add(handler)
    return () => this.updateHandlers.delete(handler)
  }

  emit(conversationId: string, event: ConversationEvent): void {
    const set = this.handlers.get(conversationId)
    if (set) for (const h of set) h(event)
  }

  emitSummary(summary: ConversationSummary): void {
    for (const handler of this.updateHandlers) handler(summary)
  }
}

function summaryFor(conversationId: string, updatedAt: number): ConversationSummary {
  return {
    conversationId,
    runtimeId: 'builtin.tea',
    workspaceId: 'desktop-workspace',
    createdAt: updatedAt,
    updatedAt,
  }
}

function emptyCollaboration() {
  return { turnContexts: [], drafts: [], deliveries: [] }
}

function completedTurn(id: string, text = id): ConversationTurn {
  return {
    id,
    user: { id: `user-${id}`, text, attachments: [] },
    blocks: [],
    status: 'completed',
    lastEventSequence: 0,
  }
}

describe('useConversationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    setActivePinia(createPinia())
  })

  it('loads runtimes from the injected client', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    expect(store.runtimes).toHaveLength(1)
    expect(store.error).toBeNull()
  })

  it('initializes and extends the catalog with keyset pages', async () => {
    const fake = new FakeClient()
    fake.pages = [
      { items: [summaryFor('newer', 20)], nextCursor: 'cursor-1', hasMore: true },
      { items: [summaryFor('older', 10)], nextCursor: null, hasMore: false },
    ]
    const store = useConversationStore()
    store.configure(fake)

    await store.initializeConversationList()
    expect(store.conversations.map(item => item.conversationId)).toEqual(['newer'])
    expect(store.hasMore).toBe(true)
    await store.loadMoreConversations()
    expect(store.conversations.map(item => item.conversationId)).toEqual(['newer', 'older'])
    expect(store.hasMore).toBe(false)
  })

  it('loads a selected conversation snapshot and merges catalog updates', async () => {
    const fake = new FakeClient()
    fake.pages = [{ items: [summaryFor('saved', 1)], nextCursor: null, hasMore: false }]
    const store = useConversationStore()
    store.configure(fake)
    await store.initializeConversationList()

    await store.selectConversation('saved')
    expect(store.conversationId).toBe('saved')
    expect(store.historyError).toBeNull()

    fake.emitSummary({ ...summaryFor('saved', 30), title: 'Restored title' })
    expect(store.conversations[0]).toMatchObject({
      conversationId: 'saved',
      title: 'Restored title',
      updatedAt: 30,
    })
    expect(store.activeConversation?.title).toBe('Restored title')
  })

  it('loads newest history then prepends an older page chronologically', async () => {
    const fake = new FakeClient()
    fake.pages = [{ items: [summaryFor('saved', 1)], nextCursor: null, hasMore: false }]
    fake.historyPages.set('saved', [
      { items: [completedTurn('three'), completedTurn('four')], nextCursor: 'older-1', hasMore: true, startIndex: 2 },
      { items: [completedTurn('one'), completedTurn('two')], nextCursor: null, hasMore: false, startIndex: 0 },
    ])
    const store = useConversationStore()
    store.configure(fake)
    await store.initializeConversationList()

    await store.selectConversation('saved')
    await store.loadOlderHistory()

    expect(store.turns.map(turn => turn.id)).toEqual(['one', 'two', 'three', 'four'])
    expect(store.historyHasMore).toBe(false)
    expect(store.historyNextCursor).toBeNull()
  })

  it('preserves loaded history when an older page fails', async () => {
    const fake = new FakeClient()
    fake.pages = [{ items: [summaryFor('saved', 1)], nextCursor: null, hasMore: false }]
    fake.historyPages.set('saved', [
      { items: [completedTurn('current')], nextCursor: 'older-1', hasMore: true, startIndex: 1 },
      new Error('history transport failed'),
    ])
    const store = useConversationStore()
    store.configure(fake)
    await store.initializeConversationList()
    await store.selectConversation('saved')

    await store.loadOlderHistory()

    expect(store.turns.map(turn => turn.id)).toEqual(['current'])
    expect(store.historyPageError).toEqual({ kind: 'runtime', message: 'history transport failed' })
    expect(store.historyHasMore).toBe(true)
  })

  it('deduplicates old pages without overwriting the live projection', () => {
    const current = completedTurn('shared', 'live')
    expect(mergeHistoryTurns(
      [current, completedTurn('new')],
      [completedTurn('old'), completedTurn('shared', 'stale')],
    ).map(turn => [turn.id, turn.user.text])).toEqual([
      ['old', 'old'],
      ['shared', 'live'],
      ['new', 'new'],
    ])
  })

  it('does not reload the active conversation when it is selected again', async () => {
    const fake = new FakeClient()
    fake.pages = [{ items: [summaryFor('saved', 1)], nextCursor: null, hasMore: false }]
    const store = useConversationStore()
    store.configure(fake)
    await store.initializeConversationList()

    await store.selectConversation('saved')
    await store.selectConversation('saved')

    expect(fake.getConversationCalls).toEqual(['saved'])
    expect(fake.subscriptionCalls).toEqual(['saved'])
    expect(store.historyLoading).toBe(false)
  })

  it('locks runtime selection after restoring a catalog conversation', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([
      runtime,
      { ...runtime, id: 'external.claude', kind: 'externalCli', displayName: 'Claude Code' },
    ])
    fake.pages = [{ items: [summaryFor('saved', 1)], nextCursor: null, hasMore: false }]
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.initializeConversationList()
    await store.selectConversation('saved')

    store.selectRuntime('external.claude')

    expect(store.conversationId).toBe('saved')
    expect(store.activeRuntimeId).toBe('builtin.tea')
    expect(store.canSelectRuntime).toBe(false)

    store.startNewConversation()
    store.selectRuntime('external.claude')
    expect(store.activeRuntimeId).toBe('external.claude')
    expect(store.canSelectRuntime).toBe(true)
  })

  it('does not let a stale history response replace the latest selection', async () => {
    const fake = new FakeClient()
    fake.pages = [{
      items: [summaryFor('older', 1), summaryFor('newer', 2)],
      nextCursor: null,
      hasMore: false,
    }]
    let resolveOlder!: (detail: ConversationDetail) => void
    let resolveNewer!: (detail: ConversationDetail) => void
    fake.detailPromises.set('older', new Promise(resolve => { resolveOlder = resolve }))
    fake.detailPromises.set('newer', new Promise(resolve => { resolveNewer = resolve }))
    const store = useConversationStore()
    store.configure(fake)
    await store.initializeConversationList()

    const olderSelection = store.selectConversation('older')
    const newerSelection = store.selectConversation('newer')
    resolveNewer({ summary: summaryFor('newer', 2), collaboration: emptyCollaboration() })
    await newerSelection
    resolveOlder({ summary: summaryFor('older', 1), collaboration: emptyCollaboration() })
    await olderSelection

    expect(store.conversationId).toBe('newer')
  })

  it('uses the configured default runtime for the next new conversation', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([
      {
        ...runtime,
        id: 'external.claude',
        kind: 'externalCli',
        displayName: 'Claude Code',
      },
      runtime,
    ])
    const store = useConversationStore()
    store.configure(fake)
    store.setDefaultRuntimeId('external.claude')
    await store.loadRuntimes()
    expect(store.activeRuntimeId).toBe('external.claude')

    store.selectRuntime('builtin.tea')
    store.setDefaultRuntimeId('external.claude')
    expect(store.activeRuntimeId).toBe('builtin.tea')
    store.startNewConversation()
    expect(store.activeRuntimeId).toBe('external.claude')
  })

  it('falls back to a ready runtime without changing the saved default', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([
      { ...runtime, id: 'external.claude', kind: 'externalCli', status: 'unavailable' },
      runtime,
    ])
    const store = useConversationStore()
    store.configure(fake)
    store.setDefaultRuntimeId('external.claude')

    await store.loadRuntimes()

    expect(store.activeRuntimeId).toBe('builtin.tea')
    expect(store.defaultRuntimeId).toBe('external.claude')
  })

  it('keeps an explicit Tea model when the provider catalog refreshes', async () => {
    const centerModel = {
      value: 'center.workshop:gpt-center',
      providerId: 'center.workshop',
      displayName: 'GPT Center',
      source: 'center' as const,
    }
    const fake = new FakeClient()
    fake.setRuntimes([{ ...runtime, models: [centerModel] }])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    store.selectedModel = centerModel.value

    fake.setRuntimes([{
      ...runtime,
      models: [{
        value: 'local.openai:gpt-local',
        providerId: 'local.openai',
        displayName: 'GPT Local',
        source: 'local',
      }],
    }])
    store.setManagedModelOptions([])
    await store.loadRuntimes()

    expect(store.selectedModel).toBe(centerModel.value)
    expect(store.modelOptions.at(-1)).toEqual({
      value: centerModel.value,
      label: centerModel.value,
      unavailable: true,
    })
  })

  it('creates a conversation and sends a message', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    store.selectRuntime('builtin.tea')
    await store.createConversation()
    expect(store.conversationId).not.toBeNull()
    expect(store.canSelectRuntime).toBe(false)
    store.selectedModel = 'sonnet'
    store.permissionMode = 'fullAccess'
    await store.sendMessage('Hello')
    expect(store.turns).toHaveLength(1)
    expect(store.turns[0].user).toMatchObject({ text: 'Hello', attachments: [] })
    expect(fake.sendCalls).toBe(1)
    expect(fake.lastSendOptions).toEqual({
      model: 'sonnet',
      permissionMode: 'fullAccess',
    })
  })

  it('does not invent a sidebar record when the backend returns no summary', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    fake.createSummary = null
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()

    await store.createConversation()

    expect(store.conversationId).toBe('conv-1')
    expect(store.conversations).toEqual([])
  })

  it('appends assistant text from streaming events', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    store.selectRuntime('builtin.tea')
    await store.createConversation()
    await store.sendMessage('Hi')
    const convId = store.conversationId!
    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: { type: 'messageDelta', text: 'Hello ' },
    })
    fake.emit(convId, {
      conversationId: convId,
      sequence: 2,
      event: { type: 'messageDelta', text: 'world!' },
    })
    const assistant = store.turns[0].blocks.find(block => block.kind === 'assistantText')
    expect(assistant?.kind).toBe('assistantText')
    if (assistant?.kind !== 'assistantText') throw new Error('assistant text block missing')
    expect(assistant.text).toBe('Hello world!')
    expect(assistant.streaming).toBe(true)
    fake.emit(convId, {
      conversationId: convId,
      sequence: 3,
      event: { type: 'runFinished' },
    })
    expect(store.isStreaming).toBe(false)
    const completedAssistant = store.turns[0].blocks.find(block => block.kind === 'assistantText')
    expect(completedAssistant?.kind === 'assistantText' && completedAssistant.streaming).toBe(false)
  })

  it('handles run failure events', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    store.selectRuntime('builtin.tea')
    await store.createConversation()
    await store.sendMessage('test')
    const convId = store.conversationId!
    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: {
        type: 'runFailed',
        failure: { code: 'rateLimited', message: 'HTTP 429: quota exceeded', retryable: true },
      },
    })
    expect(store.isStreaming).toBe(false)
    const tip = store.turns[0].blocks.find(block => block.kind === 'failureTip')
    expect(tip?.kind === 'failureTip' && tip.failure).toEqual({
      code: 'rateLimited',
      message: 'HTTP 429: quota exceeded',
      retryable: true,
    })
    expect(store.turns[0].blocks.some(block => block.kind === 'assistantText')).toBe(false)
  })

  it('keeps partial assistant text before appending a failure tip', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.createConversation()
    await store.sendMessage('test')
    const convId = store.conversationId!

    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: { type: 'messageDelta', text: 'Partial answer' },
    })
    fake.emit(convId, {
      conversationId: convId,
      sequence: 2,
      event: {
        type: 'runFailed',
        failure: { code: 'rateLimited', message: 'HTTP 429', retryable: true },
      },
    })

    const assistant = store.turns[0].blocks.find(block => block.kind === 'assistantText')
    expect(assistant?.kind === 'assistantText' && assistant.text).toBe('Partial answer')
    expect(assistant?.kind === 'assistantText' && assistant.streaming).toBe(false)
    expect(store.turns[0].blocks.at(-1)?.kind).toBe('failureTip')
  })

  it('projects native tool activity events without changing the assistant transcript', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.createConversation()
    await store.sendMessage('Read fixture.txt')
    const convId = store.conversationId!

    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: { type: 'toolRequested', toolCallId: 'tool-1', name: 'read', arguments: { path: 'fixture.txt' } },
    })
    fake.emit(convId, {
      conversationId: convId,
      sequence: 2,
      event: {
        type: 'toolProgress',
        toolCallId: 'tool-1',
        message: 'Reading fixture.txt',
        completedUnits: 1,
      },
    })

    expect(store.turns[0].blocks).toEqual([
      {
        kind: 'toolCall',
        id: 'tool-1',
        sequence: 1,
        name: 'read',
        status: 'running',
        arguments: { path: 'fixture.txt' },
        message: 'Reading fixture.txt',
        completedUnits: 1,
        totalUnits: undefined,
      },
    ])
    expect(store.turns[0].blocks.some(block => block.kind === 'assistantText')).toBe(false)

    fake.emit(convId, {
      conversationId: convId,
      sequence: 3,
      event: { type: 'runFinished' },
    })
    expect(store.turns[0].blocks[0]).toMatchObject({ kind: 'toolCall', status: 'completed' })
  })

  it('cancels an active stream', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    store.selectRuntime('builtin.tea')
    await store.createConversation()
    await store.sendMessage('test')
    await store.cancelConversation()
    expect(fake.cancelCalls).toBe(1)
    expect(store.isStreaming).toBe(false)
  })

  it('projects and resolves an approval request through the typed client', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.createConversation()
    await store.sendMessage('Update fixture.txt')
    const convId = store.conversationId!

    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: {
        type: 'toolRequested',
        toolCallId: 'tool-write',
        name: 'write',
        arguments: { path: 'fixture.txt' },
      },
    })
    fake.emit(convId, {
      conversationId: convId,
      sequence: 2,
      event: {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-write',
        capabilities: ['filesystem.write'],
        resources: ['fixture.txt'],
        decisions: ['allowOnce', 'allowSession', 'deny', 'cancel'],
      },
    })

    expect(store.turns[0].blocks[0]).toMatchObject({
      kind: 'toolCall',
      id: 'tool-write',
      status: 'approvalRequired',
      approval: {
        id: 'approval-1',
        toolCallId: 'tool-write',
        toolName: 'write',
        capabilities: ['filesystem.write'],
        resources: ['fixture.txt'],
        decisions: ['allowOnce', 'allowSession', 'deny', 'cancel'],
        status: 'pending',
      },
    })

    await store.respondToApproval('approval-1', 'allowSession')
    expect(fake.approvalCalls).toEqual([
      { conversationId: convId, approvalId: 'approval-1', decision: 'allowSession' },
    ])
    expect(store.turns[0].blocks[0]).toMatchObject({
      kind: 'toolCall',
      status: 'running',
      approval: undefined,
    })
  })

  it('keeps a failed approval pending for retry', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    fake.approvalError = new Error('approval transport failed')
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.createConversation()
    await store.sendMessage('Update fixture.txt')
    const convId = store.conversationId!

    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-write',
        capabilities: ['filesystem.write'],
        resources: ['fixture.txt'],
        decisions: ['allowOnce'],
      },
    })

    await store.respondToApproval('approval-1', 'allowOnce')

    expect(store.turns[0].blocks[0]).toMatchObject({
      kind: 'toolCall',
      approval: {
        id: 'approval-1',
        status: 'failed',
        error: 'approval transport failed',
      },
    })
  })

  it('replaces duplicate approvals for the same tool call', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.createConversation()
    await store.sendMessage('Update fixture.txt')
    const convId = store.conversationId!

    for (const [sequence, approvalId] of [[1, 'approval-1'], [2, 'approval-2']] as const) {
      fake.emit(convId, {
        conversationId: convId,
        sequence,
        event: {
          type: 'approvalRequested',
          approvalId,
          toolCallId: 'tool-write',
          capabilities: ['filesystem.write'],
          resources: ['fixture.txt'],
          decisions: ['allowOnce'],
        },
      })
    }

    expect(store.turns[0].blocks).toHaveLength(1)
    expect(store.turns[0].blocks[0]).toMatchObject({
      kind: 'toolCall',
      approval: { id: 'approval-2' },
    })
  })

  it('clears pending approvals when the run terminates', async () => {
    const fake = new FakeClient()
    fake.setRuntimes([runtime])
    const store = useConversationStore()
    store.configure(fake)
    await store.loadRuntimes()
    await store.createConversation()
    await store.sendMessage('Update fixture.txt')
    const convId = store.conversationId!

    fake.emit(convId, {
      conversationId: convId,
      sequence: 1,
      event: {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-write',
        capabilities: ['filesystem.write'],
        resources: ['fixture.txt'],
        decisions: ['allowOnce'],
      },
    })
    fake.emit(convId, {
      conversationId: convId,
      sequence: 2,
      event: { type: 'runFinished' },
    })

    expect(store.turns[0].blocks[0]).toMatchObject({
      kind: 'toolCall',
      approval: undefined,
      status: 'cancelled',
    })
  })

  it('sets error when client is not configured', async () => {
    const store = useConversationStore()
    await store.loadRuntimes()
    expect(store.error).toEqual({
      kind: 'localized',
      key: 'errors.clientNotConfigured',
    })
  })

  it('clears the workspace and ignores a late runtime response after dispose', async () => {
    const fake = new FakeClient()
    let release!: (value: RuntimeDescriptor[]) => void
    const runtimes = new Promise<RuntimeDescriptor[]>(resolve => { release = resolve })
    fake.listRuntimes = () => runtimes
    fake.pages = [{ items: [summaryFor('tenant-a', 10)], nextCursor: null, hasMore: false }]
    const store = useConversationStore()
    store.configure(fake)
    await store.initializeConversationList()
    const loading = store.loadRuntimes()

    await store.dispose()
    release([runtime])
    await loading

    expect(store.runtimes).toEqual([])
    expect(store.conversations).toEqual([])
    expect(store.conversationId).toBeNull()
    expect(store.turns).toEqual([])
    expect(store.loading).toBe(false)
  })
})
