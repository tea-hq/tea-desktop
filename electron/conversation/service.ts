import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type {
  ApprovalDecision,
  ConversationDetail,
  ConversationEvent,
  ConversationHistoryPage,
  ConversationPage,
  ConversationSummary,
  HostToolDefinition,
  HostToolResult,
  ListConversationsRequest,
  LoadConversationHistoryRequest,
  RuntimeDescriptor,
  SendMessageOptions,
} from '../../src/features/conversation/contracts'
import type {
  ChannelBinding,
  ChannelSource,
  ChannelSourceInput,
  CollaborationSnapshot,
  Delivery,
  DeliveryStatus,
  Draft,
  MessageRef,
} from '../../src/types/channelCollaboration'
import {
  ConversationCatalogError,
  type ConversationCatalogRecord,
  type ConversationRestoreFailure,
} from './catalog'
import {
  ConversationRuntimeError,
  type ConversationRuntime,
  type RuntimeConversationBinding,
  type RuntimeConversationCreateOptions,
  type RuntimeConversationHandle,
  type RuntimeConversationSelection,
  type RuntimeProviderConfiguration,
} from './runtime'
import type { ConversationRuntimeRegistry } from './runtimeRegistry'
import { buildChannelPrompt, MAX_VISIBLE_TEXT_CHARS } from './collaboration'
import {
  requireAvailableWorkspaceDirectory,
  type ConversationWorkspaceFileSystem,
} from './workspace'

const MAX_ID_CHARS = 512
const MAX_IDEMPOTENCY_KEY_CHARS = 128
const MAX_HOST_TOOLS = 128
const MAX_PREVIEW_CHARS = 160
const MAX_FALLBACK_TITLE_CHARS = 50
const MAX_WORKING_DIRECTORY_CHARS = 4096

export type RuntimeConversationServiceErrorCode =
  'invalidRequest' | 'runtimeUnavailable' | 'shutDown' | 'unknownConversation'

export class RuntimeConversationServiceError extends Error {
  constructor(
    readonly code: RuntimeConversationServiceErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'RuntimeConversationServiceError'
  }
}

export interface RuntimeHostToolReference {
  name: string
  version: string
}

export interface RuntimeHostToolResolver {
  resolve(references: readonly RuntimeHostToolReference[]): Promise<HostToolDefinition[]>
}

export interface RuntimeModelProviderResolver {
  resolve(providerId: string, modelId: string): RuntimeProviderConfiguration | null
}

export interface RuntimeHostToolResultResolver {
  resolve(result: HostToolResult): void
}

export interface RuntimeConversationServiceEvents {
  conversationEvent?(event: ConversationEvent): void
  conversationUpdated?(summary: ConversationSummary): void
}

export class EmptyRuntimeHostToolResolver implements RuntimeHostToolResolver {
  async resolve(references: readonly RuntimeHostToolReference[]): Promise<HostToolDefinition[]> {
    if (references.length > 0) {
      throw new ConversationRuntimeError(
        'notConfigured',
        'runtime HostTool definitions are not configured',
      )
    }
    return []
  }
}

export interface CreateRuntimeConversationRequest {
  runtimeId: string
  workspaceId: string
  idempotencyKey: string
  model?: string
  workingDirectory?: string
  channelBinding?: ChannelBinding
  hostTools?: RuntimeHostToolReference[]
}

export interface RuntimeConversationResult {
  handle: RuntimeConversationHandle
  summary: ConversationSummary
}

export interface RuntimeConversationCatalogPort {
  initialize(): Promise<void>
  create(record: ConversationCatalogRecord): ConversationCatalogRecord
  relocateWorkspace(
    conversationId: string,
    binding: RuntimeConversationBinding,
    updatedAt: number,
  ): ConversationCatalogRecord
  get(conversationId: string): ConversationCatalogRecord | null
  findByIdempotencyKey(idempotencyKey: string): ConversationCatalogRecord | null
  list(request: ListConversationsRequest): ConversationPage
  createTurnContext(
    conversationId: string,
    visibleText: string,
    sources: ChannelSourceInput[],
    createdAt: number,
  ): import('../../src/types/channelCollaboration').ConversationTurnContext
  appendTurnSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): ChannelSource[]
  removeTurnContext(conversationId: string, turnIndex: number): void
  collaborationSnapshot(conversationId: string): CollaborationSnapshot
  updateActivity(
    conversationId: string,
    titleIfMissing: string | undefined,
    lastMessagePreview: string,
    updatedAt: number,
  ): ConversationSummary
  setTitleIfMissing(conversationId: string, title: string): ConversationSummary
  createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
    createdAt: number,
  ): Draft
  updateDraft(draftId: string, content: string, updatedAt: number): Draft
  prepareDelivery(draftId: string, createdAt: number): Delivery
  updateDelivery(
    deliveryId: string,
    status: DeliveryStatus,
    updatedAt: number,
    sentMessageRef?: MessageRef,
    failureCode?: string,
  ): Delivery
  rename(conversationId: string, title: string, updatedAt: number): ConversationSummary
  archive(conversationId: string, archivedAt: number): ConversationSummary
  remove(conversationId: string): void
  recordRestoreFailure(conversationId: string, failure: ConversationRestoreFailure): void
  clearRestoreFailure(conversationId: string): void
  close(): void
}

interface PendingCreation {
  fingerprint: string
  promise: Promise<RuntimeConversationResult>
}

export class RuntimeConversationService {
  private readonly activeHandles = new Map<string, RuntimeConversationHandle>()
  private readonly activeSubscriptions = new Map<string, () => void>()
  private readonly pendingCreations = new Map<string, PendingCreation>()
  private readonly pendingRestores = new Map<string, Promise<RuntimeConversationHandle>>()
  private readonly pendingSubjectGenerations = new Map<string, Promise<void>>()
  private shutdownPromise: Promise<void> | null = null

  constructor(
    private readonly catalog: RuntimeConversationCatalogPort,
    private readonly runtimes: ConversationRuntimeRegistry,
    private readonly hostTools: RuntimeHostToolResolver,
    private readonly createConversationId: () => string = randomUUID,
    private readonly now: () => number = Date.now,
    private readonly hostToolResults?: RuntimeHostToolResultResolver,
    private readonly events: RuntimeConversationServiceEvents = {},
    private readonly modelProviders?: RuntimeModelProviderResolver,
    private readonly workspaceFileSystem?: ConversationWorkspaceFileSystem,
  ) {}

  async initialize(): Promise<void> {
    this.assertActive()
    await this.catalog.initialize()
  }

  listRuntimes(): RuntimeDescriptor[] {
    this.assertActive()
    return this.runtimes.descriptors()
  }

  listConversations(request: ListConversationsRequest): ConversationPage {
    this.assertActive()
    return this.catalog.list(request)
  }

  getConversationRecord(conversationId: string): ConversationCatalogRecord {
    this.assertActive()
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    return structuredClone(record)
  }

  getConversation(conversationId: string): ConversationDetail {
    const record = this.getConversationRecord(conversationId)
    return {
      summary: structuredClone(record.summary),
      collaboration: this.catalog.collaborationSnapshot(conversationId),
    }
  }

  collaborationSnapshot(conversationId: string): CollaborationSnapshot {
    this.assertActive()
    return this.catalog.collaborationSnapshot(conversationId)
  }

  async loadConversationHistory(
    request: LoadConversationHistoryRequest,
  ): Promise<ConversationHistoryPage> {
    this.assertActive()
    requireText(request.conversationId, MAX_ID_CHARS)
    const record = this.catalog.get(request.conversationId)
    if (!record) throw unknownConversation(request.conversationId)
    await this.activateRecord(record)
    const runtime = this.runtimes.require(record.summary.runtimeId)
    const page = structuredClone(await runtime.loadHistory(request))
    if (!record.summary.channelBinding) return page
    const collaboration = this.catalog.collaborationSnapshot(request.conversationId)
    for (const context of collaboration.turnContexts) {
      const relative = context.turnIndex - page.startIndex
      if (relative < 0) continue
      const turn = page.items.at(relative)
      if (turn) turn.user.text = context.visibleText
    }
    return structuredClone(page)
  }

  appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): ChannelSource[] {
    this.assertActive()
    return this.catalog.appendTurnSources(conversationId, turnIndex, sources)
  }

  createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Draft {
    this.assertActive()
    return this.catalog.createDraft(
      conversationId,
      sourceTurnIndex,
      sourceBlockId,
      content,
      this.timestamp(),
    )
  }

  updateDraft(draftId: string, content: string): Draft {
    this.assertActive()
    return this.catalog.updateDraft(draftId, content, this.timestamp())
  }

  prepareDelivery(draftId: string): Delivery {
    this.assertActive()
    return this.catalog.prepareDelivery(draftId, this.timestamp())
  }

  updateDelivery(
    deliveryId: string,
    status: DeliveryStatus,
    sentMessageRef?: MessageRef,
    failureCode?: string,
  ): Delivery {
    this.assertActive()
    return this.catalog.updateDelivery(
      deliveryId,
      status,
      this.timestamp(),
      sentMessageRef,
      failureCode,
    )
  }

  rename(conversationId: string, title: string): void {
    this.assertActive()
    this.emitUpdate(this.catalog.rename(conversationId, title, this.timestamp()))
  }

  archive(conversationId: string): void {
    this.assertActive()
    this.emitUpdate(this.catalog.archive(conversationId, this.timestamp()))
  }

  async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    this.assertActive()
    requireText(conversationId, MAX_ID_CHARS)
    const visibleText = requireConversationText(text)
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    const sources = options.sources
    if (record.summary.channelBinding) {
      if (sources === undefined) {
        throw invalidRequest('Channel-bound turns require an explicit source selection')
      }
    } else if (sources && sources.length > 0) {
      throw invalidRequest('Channel sources require a Channel-bound conversation')
    }
    await this.activateRecord(record)
    const runtime = this.runtimes.require(record.summary.runtimeId)
    const runtimeModel = this.resolveConversationModel(record.binding.selection, options.model)
    const createdAt = this.timestamp()
    const context = record.summary.channelBinding
      ? this.catalog.createTurnContext(conversationId, visibleText, sources!, createdAt)
      : undefined
    const runtimeText = context
      ? buildChannelPrompt(context.visibleText, context.sources)
      : visibleText
    try {
      await runtime.sendMessage({
        conversationId,
        text: runtimeText,
        options: {
          model: runtimeModel,
          permissionMode: options.permissionMode,
        },
      })
    } catch (cause) {
      if (!context) throw cause
      try {
        this.catalog.removeTurnContext(conversationId, context.turnIndex)
      } catch (cleanup) {
        throw preserveErrorCode(cause, cleanup)
      }
      throw cause
    }

    const supportsSubject = runtime.descriptor().capabilities.includes('subject')
    const summary = this.catalog.updateActivity(
      conversationId,
      supportsSubject ? undefined : fallbackTitle(visibleText),
      preview(visibleText),
      createdAt,
    )
    this.emitUpdate(summary)
    if (supportsSubject && summary.title === undefined) {
      this.scheduleSubjectGeneration(runtime, conversationId, visibleText)
    }
  }

  async createConversation(
    request: CreateRuntimeConversationRequest,
  ): Promise<RuntimeConversationResult> {
    this.assertActive()
    const input = validateCreateRequest(request)
    const fingerprint = creationFingerprint(input)
    const pending = this.pendingCreations.get(input.idempotencyKey)
    if (pending) {
      if (pending.fingerprint !== fingerprint) throw idempotencyConflict()
      return structuredClone(await pending.promise)
    }

    const promise = this.createConversationOnce(input)
    this.pendingCreations.set(input.idempotencyKey, { fingerprint, promise })
    try {
      return structuredClone(await promise)
    } finally {
      if (this.pendingCreations.get(input.idempotencyKey)?.promise === promise) {
        this.pendingCreations.delete(input.idempotencyKey)
      }
    }
  }

  async restoreConversation(conversationId: string): Promise<RuntimeConversationHandle> {
    this.assertActive()
    requireText(conversationId, MAX_ID_CHARS)
    const active = this.activeHandles.get(conversationId)
    if (active) return structuredClone(active)
    const pending = this.pendingRestores.get(conversationId)
    if (pending) return structuredClone(await pending)
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    const restoration = this.restoreConversationOnce(record)
    this.pendingRestores.set(conversationId, restoration)
    try {
      return structuredClone(await restoration)
    } finally {
      if (this.pendingRestores.get(conversationId) === restoration) {
        this.pendingRestores.delete(conversationId)
      }
    }
  }

  async relocateConversationWorkspace(
    conversationId: string,
    workspacePath: string,
  ): Promise<ConversationDetail> {
    this.assertActive()
    requireText(conversationId, MAX_ID_CHARS)
    const requestedPath = validateWorkingDirectory(workspacePath)
    if (!requestedPath) throw invalidRequest('working directory is required')
    const canonicalPath = validateWorkingDirectory(
      await requireAvailableWorkspaceDirectory(requestedPath, {
        canonicalize: true,
        fileSystem: this.workspaceFileSystem,
      }),
    )
    if (!canonicalPath) throw invalidRequest('working directory is required')

    await this.waitForRestoreSlot(conversationId)
    if (this.activeHandles.has(conversationId)) {
      throw invalidRequest('an active conversation workspace cannot be relocated')
    }
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    const relocation = this.relocateConversationWorkspaceOnce(record, canonicalPath)
    this.pendingRestores.set(conversationId, relocation)
    try {
      await relocation
      return this.getConversation(conversationId)
    } finally {
      if (this.pendingRestores.get(conversationId) === relocation) {
        this.pendingRestores.delete(conversationId)
      }
    }
  }

  async cancel(conversationId: string): Promise<void> {
    this.assertActive()
    requireText(conversationId, MAX_ID_CHARS)
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    if (!this.activeHandles.has(conversationId)) return
    await this.runtimes.require(record.summary.runtimeId).cancel(conversationId)
  }

  async respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    this.assertActive()
    requireText(conversationId, MAX_ID_CHARS)
    requireText(approvalId, MAX_ID_CHARS)
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    if (!this.activeHandles.has(conversationId)) {
      throw new ConversationRuntimeError(
        'unknownApproval',
        `conversation has no active approval: ${conversationId}`,
      )
    }
    await this.runtimes
      .require(record.summary.runtimeId)
      .resolveApproval(conversationId, approvalId, decision)
  }

  resolveHostToolCall(result: HostToolResult): void {
    this.assertActive()
    if (!this.catalog.get(result.conversationId)) throw unknownConversation(result.conversationId)
    if (!this.hostToolResults) {
      throw new ConversationRuntimeError(
        'notConfigured',
        'runtime HostTool result handling is not configured',
      )
    }
    this.hostToolResults.resolve(structuredClone(result))
  }

  async remove(conversationId: string): Promise<void> {
    this.assertActive()
    requireText(conversationId, MAX_ID_CHARS)
    const record = this.catalog.get(conversationId)
    if (!record) throw unknownConversation(conversationId)
    await this.pendingRestores.get(conversationId)?.catch(() => undefined)
    const runtime = this.runtimes.require(record.summary.runtimeId)
    await runtime.deleteConversation(
      conversationId,
      record.binding,
      this.resolveRuntimeSelection(record.binding.selection),
    )
    this.forgetActiveConversation(conversationId)
    this.catalog.remove(conversationId)
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownAll()
    return this.shutdownPromise
  }

  private async createConversationOnce(
    request: Required<
      Pick<
        CreateRuntimeConversationRequest,
        'runtimeId' | 'workspaceId' | 'idempotencyKey' | 'model'
      >
    > &
      Pick<CreateRuntimeConversationRequest, 'workingDirectory' | 'channelBinding'> & {
        hostTools: RuntimeHostToolReference[]
      },
  ): Promise<RuntimeConversationResult> {
    const existing = this.catalog.findByIdempotencyKey(request.idempotencyKey)
    if (existing) {
      assertSameCreation(existing, request)
      const handle = await this.activateRecord(existing)
      return { handle, summary: structuredClone(existing.summary) }
    }

    const runtime = this.requireReadyRuntime(request.runtimeId)
    const conversationId = this.createConversationId()
    requireText(conversationId, MAX_ID_CHARS)
    const runtimeModel = this.resolveRuntimeModel(request.model)
    let handle: RuntimeConversationHandle | undefined
    try {
      const definitions = await this.hostTools.resolve(
        request.hostTools.map(({ name, version }) => ({ name, version })),
      )
      assertExactHostTools(request.hostTools, definitions)
      await runtime.configureHostTools(conversationId, definitions)
      const created = await runtime.createConversation(conversationId, {
        ...runtimeModel,
        ...(request.workingDirectory ? { workspacePath: request.workingDirectory } : {}),
      })
      handle = {
        ...created,
        binding: withRuntimeConversationSelection(created.binding, modelSelection(request.model)),
      }
      const timestamp = this.timestamp()
      const summary: ConversationSummary = {
        conversationId,
        runtimeId: request.runtimeId,
        workspaceId: request.workspaceId,
        workingDirectory: handle.binding.workspacePath,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(request.channelBinding
          ? { channelBinding: structuredClone(request.channelBinding) }
          : {}),
      }
      const record = this.catalog.create({
        summary,
        nativeSessionId: handle.nativeSessionId,
        idempotencyKey: request.idempotencyKey,
        binding: handle.binding,
      })
      this.rememberActiveConversation(runtime, handle)
      this.emitUpdate(record.summary)
      return { handle, summary: record.summary }
    } catch (cause) {
      const failure = await closeAfterFailure(runtime, conversationId, cause)
      throw failure
    }
  }

  private async activateRecord(
    record: ConversationCatalogRecord,
  ): Promise<RuntimeConversationHandle> {
    const active = this.activeHandles.get(record.summary.conversationId)
    if (active) return structuredClone(active)
    const pending = this.pendingRestores.get(record.summary.conversationId)
    if (pending) return structuredClone(await pending)
    const restoration = this.restoreConversationOnce(record)
    this.pendingRestores.set(record.summary.conversationId, restoration)
    try {
      return structuredClone(await restoration)
    } finally {
      if (this.pendingRestores.get(record.summary.conversationId) === restoration) {
        this.pendingRestores.delete(record.summary.conversationId)
      }
    }
  }

  private async restoreConversationOnce(
    record: ConversationCatalogRecord,
  ): Promise<RuntimeConversationHandle> {
    const conversationId = record.summary.conversationId
    let runtime: ConversationRuntime | undefined
    let definitions: HostToolDefinition[]
    try {
      runtime = this.runtimes.require(record.summary.runtimeId)
      this.assertRuntimeReady(runtime, record.summary.runtimeId)
      definitions = await this.hostTools.resolve(structuredClone(record.binding.hostTools))
      assertExactHostTools(record.binding.hostTools, definitions)
      await runtime.configureHostTools(conversationId, definitions)
      const handle = await runtime.restoreConversation(
        conversationId,
        record.binding,
        this.resolveRuntimeSelection(record.binding.selection),
      )
      this.catalog.clearRestoreFailure(conversationId)
      this.rememberActiveConversation(runtime, handle)
      return handle
    } catch (cause) {
      if (this.activeHandles.has(conversationId)) throw cause
      const failure = await cleanupFailedRestore(
        runtime,
        conversationId,
        cause,
        this.catalog,
        this.now,
      )
      throw failure
    }
  }

  private async relocateConversationWorkspaceOnce(
    record: ConversationCatalogRecord,
    workspacePath: string,
  ): Promise<RuntimeConversationHandle> {
    const conversationId = record.summary.conversationId
    const runtime = this.requireReadyRuntime(record.summary.runtimeId)
    const candidateBinding: RuntimeConversationBinding = {
      ...structuredClone(record.binding),
      workspacePath,
    }
    let handle: RuntimeConversationHandle
    try {
      const definitions = await this.hostTools.resolve(structuredClone(record.binding.hostTools))
      assertExactHostTools(record.binding.hostTools, definitions)
      await runtime.configureHostTools(conversationId, definitions)
      handle = await runtime.restoreConversation(
        conversationId,
        candidateBinding,
        this.resolveRuntimeSelection(record.binding.selection),
      )
      assertRelocatedHandle(conversationId, candidateBinding, handle)
    } catch (cause) {
      throw await closeAfterFailure(runtime, conversationId, cause)
    }

    let candidateSubscription: () => void
    try {
      candidateSubscription = runtime.subscribe(conversationId, (event) => this.emitEvent(event))
    } catch (cause) {
      throw await closeAfterFailure(runtime, conversationId, cause)
    }

    let relocated: ConversationCatalogRecord
    try {
      relocated = this.catalog.relocateWorkspace(conversationId, handle.binding, this.timestamp())
    } catch (cause) {
      let failure = cause
      try {
        candidateSubscription()
      } catch (cleanup) {
        failure = preserveErrorCode(cause, cleanup)
      }
      throw await closeAfterFailure(runtime, conversationId, failure)
    }
    this.rememberActiveConversationWithSubscription(handle, candidateSubscription)
    this.emitUpdate(relocated.summary)
    return handle
  }

  private async waitForRestoreSlot(conversationId: string): Promise<void> {
    let pending = this.pendingRestores.get(conversationId)
    while (pending) {
      await pending.catch(() => undefined)
      if (this.pendingRestores.get(conversationId) === pending) {
        this.pendingRestores.delete(conversationId)
      }
      pending = this.pendingRestores.get(conversationId)
    }
  }

  private requireReadyRuntime(runtimeId: string): ConversationRuntime {
    const runtime = this.runtimes.require(runtimeId)
    this.assertRuntimeReady(runtime, runtimeId)
    return runtime
  }

  private resolveRuntimeModel(model: string): RuntimeConversationCreateOptions {
    return this.resolveRuntimeSelection(modelSelection(model))
  }

  private resolveRuntimeSelection(
    selection: RuntimeConversationSelection | undefined,
  ): RuntimeConversationCreateOptions {
    if (!selection) return { model: 'default' }
    if (!selection.providerId) return { model: selection.modelId }
    const provider = this.modelProviders?.resolve(selection.providerId, selection.modelId)
    if (!provider) {
      throw invalidRequest(`model provider is not configured: ${selection.providerId}`)
    }
    return { model: selection.modelId, provider }
  }

  private resolveConversationModel(
    recorded: RuntimeConversationSelection | undefined,
    requestedModel: string,
  ): string {
    const requested = modelSelection(requestedModel)
    if (!recorded) return requested.modelId

    if (requestedModel === 'default') {
      return recorded.modelId
    }
    if (recorded.providerId) {
      if (requested.providerId !== recorded.providerId) {
        throw invalidRequest('model provider cannot change for an active conversation')
      }
    } else if (requested.providerId) {
      throw invalidRequest('model provider cannot change for an active conversation')
    }
    return requested.modelId
  }

  private assertRuntimeReady(runtime: ConversationRuntime, runtimeId: string): void {
    if (runtime.descriptor().status !== 'ready') {
      throw new RuntimeConversationServiceError(
        'runtimeUnavailable',
        `conversation runtime is not ready: ${runtimeId}`,
        true,
      )
    }
  }

  private async shutdownAll(): Promise<void> {
    await Promise.allSettled([
      ...[...this.pendingCreations.values()].map((pending) => pending.promise),
      ...this.pendingRestores.values(),
    ])
    const failures: unknown[] = []
    try {
      await this.runtimes.shutdown()
    } catch (cause) {
      failures.push(cause)
    }
    await Promise.allSettled([...this.pendingSubjectGenerations.values()])
    try {
      this.catalog.close()
    } catch (cause) {
      failures.push(cause)
    }
    this.activeHandles.clear()
    for (const unsubscribe of this.activeSubscriptions.values()) unsubscribe()
    this.activeSubscriptions.clear()
    if (failures.length > 0) {
      throw new AggregateError(failures, 'runtime conversation service shutdown failed')
    }
  }

  private assertActive(): void {
    if (this.shutdownPromise) {
      throw new RuntimeConversationServiceError(
        'shutDown',
        'runtime conversation service has shut down',
      )
    }
  }

  private scheduleSubjectGeneration(
    runtime: ConversationRuntime,
    conversationId: string,
    sourceText: string,
  ): void {
    if (this.pendingSubjectGenerations.has(conversationId)) return
    const generation = (async () => {
      try {
        const title = await runtime.generateSubject(sourceText)
        this.emitUpdate(this.catalog.setTitleIfMissing(conversationId, title))
      } catch {
        // Subject metadata is optional and may be retried after a later accepted turn.
      }
    })()
    this.pendingSubjectGenerations.set(conversationId, generation)
    void generation.then(() => {
      if (this.pendingSubjectGenerations.get(conversationId) === generation) {
        this.pendingSubjectGenerations.delete(conversationId)
      }
    })
  }

  private rememberActiveConversation(
    runtime: ConversationRuntime,
    handle: RuntimeConversationHandle,
  ): void {
    const conversationId = handle.conversationId
    const unsubscribe = runtime.subscribe(conversationId, (event) => this.emitEvent(event))
    this.rememberActiveConversationWithSubscription(handle, unsubscribe)
  }

  private rememberActiveConversationWithSubscription(
    handle: RuntimeConversationHandle,
    unsubscribe: () => void,
  ): void {
    const conversationId = handle.conversationId
    this.activeSubscriptions.get(conversationId)?.()
    this.activeSubscriptions.set(conversationId, unsubscribe)
    this.activeHandles.set(conversationId, structuredClone(handle))
  }

  private forgetActiveConversation(conversationId: string): void {
    this.activeSubscriptions.get(conversationId)?.()
    this.activeSubscriptions.delete(conversationId)
    this.activeHandles.delete(conversationId)
  }

  private emitEvent(event: ConversationEvent): void {
    try {
      this.events.conversationEvent?.(structuredClone(event))
    } catch {
      // Event consumers cannot mutate or stop the authoritative runtime.
    }
  }

  private emitUpdate(summary: ConversationSummary): void {
    try {
      this.events.conversationUpdated?.(structuredClone(summary))
    } catch {
      // Event consumers cannot mutate or stop catalog writes.
    }
  }

  private timestamp(): number {
    const value = this.now()
    validateTimestamp(value)
    return value
  }
}

function validateCreateRequest(request: CreateRuntimeConversationRequest): Required<
  Pick<CreateRuntimeConversationRequest, 'runtimeId' | 'workspaceId' | 'idempotencyKey' | 'model'>
> &
  Pick<CreateRuntimeConversationRequest, 'workingDirectory' | 'channelBinding'> & {
    hostTools: RuntimeHostToolReference[]
  } {
  requireText(request.runtimeId, MAX_ID_CHARS)
  requireText(request.workspaceId, MAX_ID_CHARS)
  if (
    !new RegExp(`^[A-Za-z0-9._:-]{1,${MAX_IDEMPOTENCY_KEY_CHARS}}$`).test(request.idempotencyKey)
  ) {
    throw invalidRequest('idempotency key is invalid')
  }
  const model = request.model ?? 'default'
  requireText(model, MAX_ID_CHARS)
  const workingDirectory = validateWorkingDirectory(request.workingDirectory)
  if (request.channelBinding) {
    requireText(request.channelBinding.transportId, MAX_ID_CHARS)
    requireText(request.channelBinding.accountRef, MAX_ID_CHARS)
    requireText(request.channelBinding.channelRef, MAX_ID_CHARS)
  }
  const hostTools = structuredClone(request.hostTools ?? [])
  if (hostTools.length > MAX_HOST_TOOLS) throw invalidRequest('HostTool selection is invalid')
  const references = new Set<string>()
  for (const tool of hostTools) {
    requireText(tool.name, MAX_ID_CHARS)
    requireText(tool.version, MAX_ID_CHARS)
    const key = hostToolKey(tool)
    if (references.has(key)) throw invalidRequest('HostTool selection contains duplicates')
    references.add(key)
  }
  return {
    runtimeId: request.runtimeId,
    workspaceId: request.workspaceId,
    idempotencyKey: request.idempotencyKey,
    model,
    ...(workingDirectory ? { workingDirectory } : {}),
    ...(request.channelBinding ? { channelBinding: structuredClone(request.channelBinding) } : {}),
    hostTools,
  }
}

function assertSameCreation(
  record: ConversationCatalogRecord,
  request: ReturnType<typeof validateCreateRequest>,
): void {
  if (
    record.summary.runtimeId !== request.runtimeId ||
    record.summary.workspaceId !== request.workspaceId ||
    (request.workingDirectory !== undefined &&
      record.summary.workingDirectory !== request.workingDirectory) ||
    !sameCreationSelection(record.binding.selection, modelSelection(request.model)) ||
    !sameChannelBinding(record.summary.channelBinding, request.channelBinding) ||
    !sameHostTools(record.binding.hostTools, request.hostTools)
  ) {
    throw idempotencyConflict()
  }
}

function assertExactHostTools(
  references: readonly RuntimeHostToolReference[],
  definitions: readonly HostToolDefinition[],
): void {
  if (!sameHostTools(references, definitions)) {
    throw new ConversationRuntimeError(
      'invalidConfiguration',
      'resolved HostTools do not match the recorded runtime binding',
    )
  }
}

function assertRelocatedHandle(
  conversationId: string,
  expectedBinding: RuntimeConversationBinding,
  handle: RuntimeConversationHandle,
): void {
  if (
    handle.conversationId !== conversationId ||
    handle.runtimeId !== expectedBinding.runtimeId ||
    handle.nativeSessionId !== expectedBinding.nativeSessionId ||
    !isDeepStrictEqual(handle.binding, expectedBinding)
  ) {
    throw new ConversationRuntimeError(
      'invalidConfiguration',
      'restored runtime handle does not match the candidate workspace binding',
    )
  }
}

function sameHostTools(
  references: readonly RuntimeHostToolReference[],
  definitions: readonly RuntimeHostToolReference[],
): boolean {
  if (references.length !== definitions.length) return false
  const candidates = definitions[Symbol.iterator]()
  return references.every((reference) => {
    const candidate = candidates.next()
    return !candidate.done && hostToolKey(reference) === hostToolKey(candidate.value)
  })
}

function sameChannelBinding(left?: ChannelBinding, right?: ChannelBinding): boolean {
  if (!left || !right) return left === right
  return (
    left.transportId === right.transportId &&
    left.accountRef === right.accountRef &&
    left.channelRef === right.channelRef
  )
}

function creationFingerprint(request: ReturnType<typeof validateCreateRequest>): string {
  return JSON.stringify({
    runtimeId: request.runtimeId,
    workspaceId: request.workspaceId,
    model: request.model,
    workingDirectory: request.workingDirectory ?? null,
    channelBinding: request.channelBinding ?? null,
    hostTools: request.hostTools.map(({ name, version }) => ({ name, version })),
  })
}

async function closeAfterFailure(
  runtime: ConversationRuntime,
  conversationId: string,
  primary: unknown,
): Promise<unknown> {
  try {
    await runtime.closeConversation(conversationId)
    return primary
  } catch (cleanup) {
    return preserveErrorCode(primary, cleanup)
  }
}

async function cleanupFailedRestore(
  runtime: ConversationRuntime | undefined,
  conversationId: string,
  primary: unknown,
  catalog: RuntimeConversationCatalogPort,
  now: () => number,
): Promise<unknown> {
  const secondary: unknown[] = []
  if (runtime) {
    try {
      await runtime.closeConversation(conversationId)
    } catch (cause) {
      secondary.push(cause)
    }
  }
  try {
    const failedAt = now()
    validateTimestamp(failedAt)
    catalog.recordRestoreFailure(conversationId, {
      code: boundedFailureCode(primary),
      failedAt,
    })
  } catch (cause) {
    secondary.push(cause)
  }
  return secondary.length > 0 ? preserveErrorCode(primary, ...secondary) : primary
}

function preserveErrorCode(primary: unknown, ...secondary: unknown[]): unknown {
  const cause = new AggregateError([primary, ...secondary], 'conversation operation cleanup failed')
  if (primary instanceof ConversationCatalogError) {
    return new ConversationCatalogError(primary.code, primary.message, primary.retryable, { cause })
  }
  if (primary instanceof ConversationRuntimeError) {
    return new ConversationRuntimeError(primary.code, primary.message, primary.retryable, { cause })
  }
  if (primary instanceof RuntimeConversationServiceError) {
    return new RuntimeConversationServiceError(primary.code, primary.message, primary.retryable, {
      cause,
    })
  }
  return new ConversationRuntimeError(
    'connectionFailed',
    'runtime conversation operation failed',
    true,
    { cause },
  )
}

function boundedFailureCode(value: unknown): string {
  const code = isRecord(value) && typeof value.code === 'string' ? value.code : 'runtimeFailure'
  return /^[A-Za-z0-9._:-]{1,128}$/.test(code) ? code : 'runtimeFailure'
}

function hostToolKey(value: RuntimeHostToolReference): string {
  return `${value.name}\u0000${value.version}`
}

function modelSelection(model: string): RuntimeConversationSelection {
  const separator = model.indexOf('/')
  if (separator <= 0 || separator === model.length - 1) return { modelId: model }
  return { providerId: model.slice(0, separator), modelId: model.slice(separator + 1) }
}

function withRuntimeConversationSelection(
  binding: RuntimeConversationBinding,
  selection: RuntimeConversationSelection,
): RuntimeConversationBinding {
  return {
    ...structuredClone(binding),
    selection: structuredClone(selection),
  }
}

function sameCreationSelection(
  recorded: RuntimeConversationSelection | undefined,
  requested: RuntimeConversationSelection,
): boolean {
  if (!recorded) return requested.modelId === 'default' && requested.providerId === undefined
  return recorded.modelId === requested.modelId && recorded.providerId === requested.providerId
}

function requireText(value: unknown, maxChars: number): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > maxChars ||
    value.trim().length === 0 ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    throw invalidRequest('runtime conversation request is invalid')
  }
}

function validateWorkingDirectory(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (
    typeof value !== 'string' ||
    value.length > MAX_WORKING_DIRECTORY_CHARS ||
    value.trim().length === 0 ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n') ||
    !path.isAbsolute(value)
  ) {
    throw invalidRequest('working directory must be an absolute path')
  }
  return value.trim()
}

function requireConversationText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    [...value.trim()].length > MAX_VISIBLE_TEXT_CHARS ||
    value.includes('\0')
  ) {
    throw invalidRequest('conversation message is invalid')
  }
  return value.trim()
}

function fallbackTitle(value: string): string {
  return boundedMetadata(value.split(/\r?\n/u)[0] ?? value, MAX_FALLBACK_TITLE_CHARS)
}

function preview(value: string): string {
  return boundedMetadata(value, MAX_PREVIEW_CHARS)
}

function boundedMetadata(value: string, maximum: number): string {
  return [...value.trim()]
    .filter((character) => !/\p{Cc}/u.test(character))
    .slice(0, maximum)
    .join('')
    .trim()
}

function validateTimestamp(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidRequest('runtime conversation timestamp is invalid')
  }
}

function idempotencyConflict(): RuntimeConversationServiceError {
  return invalidRequest('idempotency key was used with different creation options')
}

function invalidRequest(message: string): RuntimeConversationServiceError {
  return new RuntimeConversationServiceError('invalidRequest', message)
}

function unknownConversation(conversationId: string): RuntimeConversationServiceError {
  return new RuntimeConversationServiceError(
    'unknownConversation',
    `conversation is not cataloged: ${conversationId}`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
