import { hasElectronBridge, invoke, listen, type UnlistenFn } from '../electronBridge'

import type {
  ApprovalDecision,
  ConversationClient,
  ConversationDetail,
  ConversationEvent,
  ConversationHistoryPage,
  ConversationPage,
  ConversationSummary,
  ConversationTurn,
  CreateConversationOptions,
  CreateConversationResponse,
  HostToolCall,
  HostToolDefinition,
  HostToolResult,
  ListConversationsRequest,
  LoadConversationHistoryRequest,
  RuntimeDescriptor,
  SendMessageOptions,
} from '@/features/conversation/contracts'
import type {
  CollaborationSnapshot,
  ChannelSource,
  ChannelSourceInput,
  Delivery,
  Draft,
  MessageRef,
} from '@/types/channelCollaboration'
import type { DesktopEvent, DesktopEventPayloadMap } from '@/types/electronBridge'

export class ElectronConversationClient implements ConversationClient {
  async listRuntimes(): Promise<RuntimeDescriptor[]> {
    return invoke<RuntimeDescriptor[]>('list_conversation_runtimes')
  }

  async listConversations(request: ListConversationsRequest): Promise<ConversationPage> {
    return invoke<ConversationPage>('list_conversations', { request })
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    return invoke<ConversationDetail>('get_conversation', { conversationId })
  }

  async loadConversationHistory(
    request: LoadConversationHistoryRequest,
  ): Promise<ConversationHistoryPage> {
    return invoke<ConversationHistoryPage>('load_conversation_history', { request })
  }

  async createConversation(
    runtimeId: string,
    options: CreateConversationOptions,
  ): Promise<CreateConversationResponse> {
    return invoke<CreateConversationResponse>('create_conversation', {
      runtimeId,
      idempotencyKey: options.idempotencyKey,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.workingDirectory === undefined
        ? {}
        : { workingDirectory: options.workingDirectory }),
      channelBinding: options?.channelBinding,
      hostTools: (options?.hostTools ?? []).map(({ name, version }) => ({ name, version })),
    })
  }

  async relocateConversationWorkspace(
    conversationId: string,
    workspacePath: string,
  ): Promise<ConversationDetail> {
    return invoke<ConversationDetail>('relocate_conversation_workspace', {
      conversationId,
      workspacePath,
    })
  }

  async appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): Promise<ChannelSource[]> {
    return invoke<ChannelSource[]>('append_conversation_sources', {
      conversationId,
      turnIndex,
      sources,
    })
  }

  async createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Promise<Draft> {
    return invoke<Draft>('create_channel_draft', {
      conversationId,
      sourceTurnIndex,
      sourceBlockId,
      content,
    })
  }

  async updateDraft(draftId: string, content: string): Promise<Draft> {
    return invoke<Draft>('update_channel_draft', { draftId, content })
  }

  async prepareDelivery(draftId: string): Promise<Delivery> {
    return invoke<Delivery>('prepare_draft_delivery', { draftId })
  }

  async markDeliverySending(deliveryId: string): Promise<Delivery> {
    return invoke<Delivery>('mark_draft_delivery_sending', { deliveryId })
  }

  async completeDelivery(deliveryId: string, sentMessageRef: MessageRef): Promise<Delivery> {
    return invoke<Delivery>('complete_draft_delivery', { deliveryId, sentMessageRef })
  }

  async failDelivery(deliveryId: string, failureCode: string): Promise<Delivery> {
    return invoke<Delivery>('fail_draft_delivery', { deliveryId, failureCode })
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await invoke('rename_conversation', { conversationId, title })
  }

  async archiveConversation(conversationId: string): Promise<void> {
    await invoke('archive_conversation', { conversationId })
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await invoke('delete_conversation', { conversationId })
  }

  async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    await invoke('send_message', {
      conversationId,
      text,
      sources: options.sources ?? [],
      model: options.model === 'default' ? null : options.model,
      permissionMode: options.permissionMode,
    })
  }

  async cancelConversation(conversationId: string): Promise<void> {
    await invoke('cancel_conversation', { conversationId })
  }

  async respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    await invoke('respond_to_approval', { conversationId, approvalId, decision })
  }

  async resolveHostToolCall(result: HostToolResult): Promise<void> {
    await invoke('resolve_host_tool_call', { result })
  }

  async subscribeToEvents(
    conversationId: string,
    handler: (event: ConversationEvent) => void,
  ): Promise<() => void> {
    const unlisten = await listen('conversation:event', (event) => {
      if (event.payload.conversationId === conversationId) {
        handler(event.payload)
      }
    })
    return unlisten
  }

  subscribeToAllEvents(handler: (event: ConversationEvent) => void): () => void {
    return subscribe('conversation:event', handler)
  }

  async subscribeToHostToolCalls(
    conversationId: string,
    handler: (call: HostToolCall) => void,
  ): Promise<() => void> {
    const unlisten = await listen('conversation:host-tool-call', (event) => {
      if (event.payload.conversationId === conversationId) handler(event.payload)
    })
    return unlisten
  }

  subscribeToConversationUpdates(handler: (summary: ConversationSummary) => void): () => void {
    return subscribe('conversation:updated', handler)
  }
}

function subscribe<Event extends DesktopEvent>(
  eventName: Event,
  handler: (payload: DesktopEventPayloadMap[Event]) => void,
): () => void {
  let unlisten: UnlistenFn | null = null
  let cancelled = false
  listen(eventName, (event) => {
    if (!cancelled) handler(event.payload)
  })
    .then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    .catch(() => {
      // The browser-only development preview has no Electron event bridge.
    })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

export class FakeConversationClient implements ConversationClient {
  private _runtimes: RuntimeDescriptor[] = []
  private _callCount = 0
  private _eventHandlers: Map<string, Set<(e: ConversationEvent) => void>> = new Map()
  private _allEventHandlers = new Set<(e: ConversationEvent) => void>()
  private _summaries: ConversationSummary[] = []
  private _updateHandlers = new Set<(summary: ConversationSummary) => void>()
  private _turns = new Map<string, ConversationTurn[]>()
  private _collaboration = new Map<string, CollaborationSnapshot>()
  private _hostTools = new Map<string, HostToolDefinition[]>()
  private _creationKeys = new Map<string, string>()

  get listRuntimesCalls(): number {
    return this._callCount
  }

  setRuntimes(runtimes: RuntimeDescriptor[]): void {
    this._runtimes = runtimes
  }

  async listRuntimes(): Promise<RuntimeDescriptor[]> {
    this._callCount++
    return structuredClone(this._runtimes)
  }

  async listConversations(request: ListConversationsRequest): Promise<ConversationPage> {
    const filter = request.filter ?? { kind: 'all' as const }
    const items = this._summaries.filter((summary) => {
      if (!request.includeArchived && summary.archivedAt) return false
      if (filter.kind === 'local') return !summary.channelBinding
      if (filter.kind === 'channel') return Boolean(summary.channelBinding)
      if (filter.kind === 'binding') return sameBinding(summary.channelBinding, filter.binding)
      return true
    })
    return { items: structuredClone(items), nextCursor: null, hasMore: false }
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const summary = this._summaries.find((item) => item.conversationId === conversationId)
    if (!summary) throw new Error('unknown conversation')
    return {
      summary: structuredClone(summary),
      collaboration: structuredClone(
        this._collaboration.get(conversationId) ?? emptyCollaboration(),
      ),
    }
  }

  async loadConversationHistory(
    request: LoadConversationHistoryRequest,
  ): Promise<ConversationHistoryPage> {
    this.requireSummary(request.conversationId)
    const turns = this._turns.get(request.conversationId) ?? []
    const startIndex = Math.max(0, turns.length - request.limit)
    return {
      items: structuredClone(turns.slice(startIndex)),
      nextCursor: null,
      hasMore: false,
      startIndex,
    }
  }

  async createConversation(
    runtimeId: string,
    options: CreateConversationOptions,
  ): Promise<CreateConversationResponse> {
    const existingId = this._creationKeys.get(options.idempotencyKey)
    if (existingId) {
      const existing = this.requireSummary(existingId)
      return {
        handle: { conversationId: existingId, runtimeId: existing.runtimeId },
        summary: structuredClone(existing),
      }
    }
    const now = Date.now()
    const handle = { conversationId: crypto.randomUUID(), runtimeId }
    const summary: ConversationSummary = {
      conversationId: handle.conversationId,
      runtimeId,
      workspaceId: 'desktop-workspace',
      workingDirectory: options.workingDirectory,
      createdAt: now,
      updatedAt: now,
      channelBinding: options?.channelBinding ? structuredClone(options.channelBinding) : undefined,
    }
    this._summaries.unshift(summary)
    this._turns.set(handle.conversationId, [])
    this._collaboration.set(handle.conversationId, emptyCollaboration())
    this._hostTools.set(handle.conversationId, structuredClone(options?.hostTools ?? []))
    this._creationKeys.set(options.idempotencyKey, handle.conversationId)
    this.emitSummary(summary)
    return { handle, summary: structuredClone(summary) }
  }

  async relocateConversationWorkspace(
    conversationId: string,
    workspacePath: string,
  ): Promise<ConversationDetail> {
    const summary = this.requireSummary(conversationId)
    summary.workingDirectory = workspacePath
    summary.updatedAt = Date.now()
    this.emitSummary(summary)
    return this.getConversation(conversationId)
  }

  async appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): Promise<ChannelSource[]> {
    const collaboration = this.requireCollaboration(conversationId)
    const context = collaboration.turnContexts.find((value) => value.turnIndex === turnIndex)
    if (!context) throw new Error('unknown turn context')
    const inserted = appendFakeSources(
      conversationId,
      turnIndex,
      'agentTool',
      context.sources,
      sources,
    )
    context.sources.push(...inserted)
    return structuredClone(inserted)
  }

  async createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Promise<Draft> {
    this.requireSummary(conversationId)
    const now = Date.now()
    const draft: Draft = {
      draftId: crypto.randomUUID(),
      conversationId,
      sourceTurnIndex,
      sourceBlockId,
      currentVersion: 1,
      content,
      createdAt: now,
      updatedAt: now,
    }
    this.requireCollaboration(conversationId).drafts.unshift(draft)
    return structuredClone(draft)
  }

  async updateDraft(draftId: string, content: string): Promise<Draft> {
    const draft = this.findDraft(draftId)
    draft.content = content
    draft.currentVersion += 1
    draft.updatedAt = Date.now()
    return structuredClone(draft)
  }

  async prepareDelivery(draftId: string): Promise<Delivery> {
    const draft = this.findDraft(draftId)
    const collaboration = this.requireCollaboration(draft.conversationId)
    const existing = collaboration.deliveries.find(
      (value) => value.draftId === draftId && value.draftVersion === draft.currentVersion,
    )
    if (existing) return structuredClone(existing)
    const binding = this.requireSummary(draft.conversationId).channelBinding
    if (!binding) throw new Error('conversation is not Channel-bound')
    const now = Date.now()
    const delivery: Delivery = {
      deliveryId: crypto.randomUUID(),
      draftId,
      draftVersion: draft.currentVersion,
      channelBinding: structuredClone(binding),
      idempotencyKey: `channel-delivery:v1:${draft.conversationId}:${draftId}:${draft.currentVersion}`,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    collaboration.deliveries.unshift(delivery)
    return structuredClone(delivery)
  }

  async markDeliverySending(deliveryId: string): Promise<Delivery> {
    return this.updateDelivery(deliveryId, (delivery) => {
      if (
        delivery.status !== 'pending' &&
        delivery.status !== 'sending' &&
        delivery.status !== 'failed'
      ) {
        throw new Error('invalid delivery state')
      }
      delivery.status = 'sending'
      delete delivery.failureCode
    })
  }

  async completeDelivery(deliveryId: string, sentMessageRef: MessageRef): Promise<Delivery> {
    return this.updateDelivery(deliveryId, (delivery) => {
      if (delivery.status === 'sent') return
      if (delivery.status !== 'sending' && delivery.status !== 'failed')
        throw new Error('invalid delivery state')
      delivery.status = 'sent'
      delivery.sentMessageRef = structuredClone(sentMessageRef)
      delete delivery.failureCode
    })
  }

  async failDelivery(deliveryId: string, failureCode: string): Promise<Delivery> {
    return this.updateDelivery(deliveryId, (delivery) => {
      if (delivery.status === 'sent') return
      delivery.status = 'failed'
      delivery.failureCode = failureCode
    })
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const summary = this.requireSummary(conversationId)
    summary.title = title
    summary.updatedAt = Date.now()
    this.emitSummary(summary)
  }

  async archiveConversation(conversationId: string): Promise<void> {
    const summary = this.requireSummary(conversationId)
    summary.archivedAt = Date.now()
    summary.updatedAt = summary.archivedAt
    this.emitSummary(summary)
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this._summaries = this._summaries.filter((value) => value.conversationId !== conversationId)
    this._turns.delete(conversationId)
    this._collaboration.delete(conversationId)
    this._hostTools.delete(conversationId)
  }

  async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    const summary = this.requireSummary(conversationId)
    const turns = this._turns.get(conversationId)!
    const turnIndex = turns.length
    const turnId = crypto.randomUUID()
    const blockId = crypto.randomUUID()
    if (summary.channelBinding) {
      const context = {
        turnIndex,
        visibleText: text,
        createdAt: Date.now(),
        sources: [] as ChannelSource[],
      }
      context.sources.push(
        ...appendFakeSources(
          conversationId,
          turnIndex,
          'userForwarded',
          context.sources,
          options.sources ?? [],
        ),
      )
      this.requireCollaboration(conversationId).turnContexts.push(context)
    }
    const sourceCount = options.sources?.length ?? 0
    const draft = [
      `## ${text}`,
      '',
      summary.channelBinding
        ? `Reviewed ${sourceCount} selected source message${sourceCount === 1 ? '' : 's'} in this Channel-bound conversation.`
        : 'This is a local Agent conversation.',
      '',
      '- Confirm the requested outcome and constraints.',
      '- Resolve open questions before proceeding.',
    ].join('\n')
    const turn: ConversationTurn = {
      id: turnId,
      user: { id: crypto.randomUUID(), text, attachments: [] },
      blocks: [{ kind: 'assistantText', id: blockId, sequence: 2, text: draft, streaming: false }],
      status: 'completed',
      lastEventSequence: 3,
    }
    turns.push(turn)
    summary.lastMessagePreview = draft.slice(0, 160)
    summary.title ??= text.slice(0, 50)
    summary.updatedAt = Date.now()
    this.emitSummary(summary)
    queueMicrotask(() => {
      this.emitEvent(conversationId, { conversationId, sequence: 1, event: { type: 'runStarted' } })
      this.emitEvent(conversationId, {
        conversationId,
        sequence: 2,
        event: { type: 'messageDelta', text: draft },
      })
      this.emitEvent(conversationId, {
        conversationId,
        sequence: 3,
        event: { type: 'runFinished' },
      })
    })
  }

  async cancelConversation(conversationId: string): Promise<void> {
    this._hostTools.set(conversationId, [])
  }

  async respondToApproval(
    _conversationId: string,
    _approvalId: string,
    _decision: ApprovalDecision,
  ): Promise<void> {}

  async resolveHostToolCall(_result: HostToolResult): Promise<void> {}

  async subscribeToEvents(
    conversationId: string,
    handler: (e: ConversationEvent) => void,
  ): Promise<() => void> {
    let handlers = this._eventHandlers.get(conversationId)
    if (!handlers) {
      handlers = new Set()
      this._eventHandlers.set(conversationId, handlers)
    }
    handlers.add(handler)
    return () => {
      handlers!.delete(handler)
    }
  }

  subscribeToAllEvents(handler: (event: ConversationEvent) => void): () => void {
    this._allEventHandlers.add(handler)
    return () => this._allEventHandlers.delete(handler)
  }

  async subscribeToHostToolCalls(
    _conversationId: string,
    _handler: (call: HostToolCall) => void,
  ): Promise<() => void> {
    return () => undefined
  }

  subscribeToConversationUpdates(handler: (summary: ConversationSummary) => void): () => void {
    this._updateHandlers.add(handler)
    return () => this._updateHandlers.delete(handler)
  }

  emitEvent(conversationId: string, event: ConversationEvent): void {
    for (const handler of this._allEventHandlers) handler(event)
    const handlers = this._eventHandlers.get(conversationId)
    if (handlers) {
      for (const h of handlers) h(event)
    }
  }

  private emitSummary(summary: ConversationSummary): void {
    for (const handler of this._updateHandlers) handler(structuredClone(summary))
  }

  private requireSummary(conversationId: string): ConversationSummary {
    const summary = this._summaries.find((value) => value.conversationId === conversationId)
    if (!summary) throw new Error('unknown conversation')
    return summary
  }

  private requireCollaboration(conversationId: string): CollaborationSnapshot {
    const collaboration = this._collaboration.get(conversationId)
    if (!collaboration) throw new Error('unknown conversation')
    return collaboration
  }

  private findDraft(draftId: string): Draft {
    for (const collaboration of this._collaboration.values()) {
      const draft = collaboration.drafts.find((value) => value.draftId === draftId)
      if (draft) return draft
    }
    throw new Error('unknown Draft')
  }

  private updateDelivery(deliveryId: string, update: (delivery: Delivery) => void): Delivery {
    for (const collaboration of this._collaboration.values()) {
      const delivery = collaboration.deliveries.find((value) => value.deliveryId === deliveryId)
      if (!delivery) continue
      update(delivery)
      delivery.updatedAt = Date.now()
      return structuredClone(delivery)
    }
    throw new Error('unknown Delivery')
  }
}

function emptyCollaboration(): CollaborationSnapshot {
  return { turnContexts: [], drafts: [], deliveries: [] }
}

function sameBinding(
  left: ConversationSummary['channelBinding'],
  right: NonNullable<ConversationSummary['channelBinding']>,
): boolean {
  return (
    left?.transportId === right.transportId &&
    left.accountRef === right.accountRef &&
    left.channelRef === right.channelRef
  )
}

function appendFakeSources(
  conversationId: string,
  turnIndex: number,
  origin: ChannelSource['origin'],
  existing: ChannelSource[],
  values: ChannelSourceInput[],
): ChannelSource[] {
  return values
    .filter(
      (value) => !existing.some((source) => sameMessageRef(source.messageRef, value.messageRef)),
    )
    .map((value) => ({
      ...structuredClone(value),
      sourceId: crypto.randomUUID(),
      conversationId,
      turnIndex,
      origin,
    }))
}

function sameMessageRef(left: MessageRef, right: MessageRef): boolean {
  return (
    left.channelRef === right.channelRef &&
    left.messageClientId === right.messageClientId &&
    (left.messageServerId === undefined ||
      right.messageServerId === undefined ||
      left.messageServerId === right.messageServerId)
  )
}

let defaultClient: ConversationClient | null = null

export function getDefaultConversationClient(): ConversationClient {
  if (!defaultClient) {
    if (!hasElectronBridge()) {
      const previewClient = new FakeConversationClient()
      previewClient.setRuntimes([
        {
          id: 'external.claude',
          kind: 'externalCli',
          displayName: 'Claude Code',
          capabilities: [
            'prompt',
            'cancel',
            'events',
            'snapshot',
            'history',
            'approval',
            'hostTools',
          ],
          status: 'ready',
        },
        {
          id: 'external.codex',
          kind: 'externalCli',
          displayName: 'Codex',
          capabilities: [
            'prompt',
            'cancel',
            'events',
            'snapshot',
            'history',
            'approval',
            'hostTools',
          ],
          status: 'ready',
        },
      ])
      defaultClient = previewClient
    } else {
      defaultClient = new ElectronConversationClient()
    }
  }
  return defaultClient
}

export function setDefaultConversationClient(client: ConversationClient | null): void {
  defaultClient = client
}
