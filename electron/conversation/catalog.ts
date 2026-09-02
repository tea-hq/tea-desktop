import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type {
  ConversationPage,
  ConversationSummary,
  ListConversationsRequest,
} from '../../src/features/conversation/contracts'
import type {
  ChannelBinding,
  ChannelSource,
  ChannelSourceInput,
  ChannelSourceOrigin,
  ChannelSourceState,
  CollaborationSnapshot,
  ConversationScopeFilter,
  ConversationTurnContext,
  Delivery,
  DeliveryStatus,
  Draft,
  MessageRef,
} from '../../src/types/channelCollaboration'
import { parseRuntimeConversationBinding, type RuntimeConversationBinding } from './runtime'
import { MainDatabaseError, MainProcessDatabase } from '../storage/database'
import { migrateConversationCatalog } from '../storage/migrations'
import {
  ConversationCollaborationError,
  MAX_SOURCES_PER_TURN,
  MAX_SOURCE_TEXT_CHARS,
  MAX_SOURCE_TEXT_CHARS_PER_TURN,
  MAX_VISIBLE_TEXT_CHARS,
  prepareChannelSources,
  prepareVisibleText,
  validTurnIndex,
  type PreparedChannelSource,
} from './collaboration'

const DEFAULT_PAGE_LIMIT = 30
const MAX_PAGE_LIMIT = 100
const MAX_ID_CHARS = 512
const MAX_IDEMPOTENCY_KEY_CHARS = 128
const MAX_TITLE_CHARS = 256
const MAX_PREVIEW_CHARS = 1_000
const MAX_BINDING_BYTES = 64 * 1024
const MAX_WORKING_DIRECTORY_CHARS = 4096
const MAX_CURSOR_CHARS = 2_048
const MAX_FAILURE_CODE_CHARS = 128
const MAX_DRAFT_CONTENT_CHARS = 8_000
const MAX_DRAFT_VERSION = 4_294_967_295

export type ConversationCatalogErrorCode =
  | 'conflict'
  | 'corruptCatalog'
  | 'invalidRequest'
  | 'shutDown'
  | 'storageFailure'
  | 'unknownConversation'
  | 'unsupportedSchema'

export class ConversationCatalogError extends Error {
  constructor(
    readonly code: ConversationCatalogErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ConversationCatalogError'
  }
}

export interface ConversationRestoreFailure {
  code: string
  failedAt: number
}

export interface ConversationCatalogRecord {
  summary: ConversationSummary
  nativeSessionId: string
  idempotencyKey: string
  binding: RuntimeConversationBinding
  lastRestoreFailure?: ConversationRestoreFailure
}

export class ConversationCatalog {
  private readonly database: MainProcessDatabase

  constructor(
    filePath: string,
    private readonly createSourceId: () => string = randomUUID,
    private readonly createDraftId: () => string = randomUUID,
    private readonly createDeliveryId: () => string = randomUUID,
  ) {
    this.database = new MainProcessDatabase(filePath)
  }

  async initialize(): Promise<void> {
    try {
      await this.database.initialize(migrateConversationCatalog)
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  create(record: ConversationCatalogRecord): ConversationCatalogRecord {
    const value = validateRecord(record)
    const bindingJson = JSON.stringify(value.binding)
    if (Buffer.byteLength(bindingJson, 'utf8') > MAX_BINDING_BYTES) throw invalidRequest()
    const channel = value.summary.channelBinding
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare(
            `
            INSERT INTO runtime_conversations (
              conversation_id, runtime_id, native_session_id, workspace_id, working_directory,
              idempotency_key, binding_json, title, last_message_preview,
              created_at, updated_at, archived_at, channel_transport_id,
              channel_account_ref, channel_ref, last_restore_failure_code,
              last_restore_failed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT DO NOTHING
          `,
          )
          .run(
            value.summary.conversationId,
            value.summary.runtimeId,
            value.nativeSessionId,
            value.summary.workspaceId,
            value.summary.workingDirectory ?? null,
            value.idempotencyKey,
            bindingJson,
            value.summary.title ?? null,
            value.summary.lastMessagePreview ?? null,
            value.summary.createdAt,
            value.summary.updatedAt,
            value.summary.archivedAt ?? null,
            channel?.transportId ?? null,
            channel?.accountRef ?? null,
            channel?.channelRef ?? null,
            value.lastRestoreFailure?.code ?? null,
            value.lastRestoreFailure?.failedAt ?? null,
          ),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'conflict',
        'conversation catalog identity is already in use',
      )
    }
    return structuredClone(value)
  }

  relocateWorkspace(
    conversationId: string,
    binding: RuntimeConversationBinding,
    updatedAt: number,
  ): ConversationCatalogRecord {
    requireText(conversationId, MAX_ID_CHARS)
    validateTimestamp(updatedAt)
    const existing = this.get(conversationId)
    if (!existing) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    if (!sameBindingExceptWorkspace(existing.binding, binding)) throw invalidRequest()
    const value = validateRecord({
      ...existing,
      summary: {
        ...existing.summary,
        workingDirectory: binding.workspacePath,
        updatedAt: Math.max(existing.summary.updatedAt, updatedAt),
      },
      binding,
      lastRestoreFailure: undefined,
    })
    const bindingJson = JSON.stringify(value.binding)
    if (Buffer.byteLength(bindingJson, 'utf8') > MAX_BINDING_BYTES) throw invalidRequest()
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare(
            `
            UPDATE runtime_conversations
            SET binding_json = ?, working_directory = ?, updated_at = ?,
              last_restore_failure_code = NULL, last_restore_failed_at = NULL
            WHERE conversation_id = ?
          `,
          )
          .run(bindingJson, binding.workspacePath, value.summary.updatedAt, conversationId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    return structuredClone(value)
  }

  get(conversationId: string): ConversationCatalogRecord | null {
    requireText(conversationId, MAX_ID_CHARS)
    let row: unknown
    try {
      row = this.database.read((database) =>
        database.prepare(`${SELECT_COLUMNS} WHERE conversation_id = ?`).get(conversationId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    return row === undefined ? null : decodeRow(row)
  }

  findByIdempotencyKey(idempotencyKey: string): ConversationCatalogRecord | null {
    validateIdempotencyKey(idempotencyKey)
    let row: unknown
    try {
      row = this.database.read((database) =>
        database.prepare(`${SELECT_COLUMNS} WHERE idempotency_key = ?`).get(idempotencyKey),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    return row === undefined ? null : decodeRow(row)
  }

  list(request: ListConversationsRequest): ConversationPage {
    const limit = validatePageLimit(request.limit)
    const cursor = decodeCursor(request.cursor)
    const filter = validateFilter(request.filter ?? { kind: 'all' })
    const conditions: string[] = []
    const parameters: SQLInputValue[] = []
    if (!request.includeArchived) conditions.push('archived_at IS NULL')
    appendFilter(conditions, parameters, filter)
    if (cursor) {
      conditions.push('(updated_at < ? OR (updated_at = ? AND conversation_id < ?))')
      parameters.push(cursor.updatedAt, cursor.updatedAt, cursor.conversationId)
    }
    parameters.push(limit + 1)
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    let rows: unknown[]
    try {
      rows = this.database.read((database) =>
        database
          .prepare(
            `${SELECT_COLUMNS}${where} ORDER BY updated_at DESC, conversation_id DESC LIMIT ?`,
          )
          .all(...parameters),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    const decoded = rows.map(decodeRow)
    const hasMore = decoded.length > limit
    const items = decoded.slice(0, limit).map((record) => record.summary)
    const last = items.at(-1)
    return {
      items: structuredClone(items),
      nextCursor:
        hasMore && last
          ? encodeCursor({ updatedAt: last.updatedAt, conversationId: last.conversationId })
          : null,
      hasMore,
    }
  }

  createTurnContext(
    conversationId: string,
    visibleText: string,
    sources: ChannelSourceInput[],
    createdAt: number,
  ): ConversationTurnContext {
    const binding = this.requireChannelBinding(conversationId)
    let normalizedText: string
    let prepared: PreparedChannelSource[]
    try {
      normalizedText = prepareVisibleText(visibleText)
      validateTimestamp(createdAt)
      prepared = prepareChannelSources(
        conversationId,
        0,
        'userForwarded',
        binding,
        structuredClone(sources),
        this.createSourceId,
      )
    } catch (cause) {
      throw collaborationInputError(cause)
    }
    try {
      return this.database.write((database) => {
        const next = database
          .prepare(
            `
            SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_turn_index
            FROM conversation_turn_contexts
            WHERE conversation_id = ?
          `,
          )
          .get(conversationId)
        const turnIndex = readTurnIndex(next, 'next_turn_index')
        database
          .prepare(
            `
            INSERT INTO conversation_turn_contexts (
              conversation_id, turn_index, visible_text, created_at
            ) VALUES (?, ?, ?, ?)
          `,
          )
          .run(conversationId, turnIndex, normalizedText, createdAt)
        const inserted = insertPreparedSources(
          database,
          prepared.map((value) => ({
            ...value,
            source: { ...value.source, turnIndex },
          })),
        )
        return {
          turnIndex,
          visibleText: normalizedText,
          createdAt,
          sources: inserted,
        }
      })
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  appendTurnSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): ChannelSource[] {
    const binding = this.requireChannelBinding(conversationId)
    if (!validTurnIndex(turnIndex)) throw invalidRequest()
    let prepared: PreparedChannelSource[]
    try {
      prepared = prepareChannelSources(
        conversationId,
        turnIndex,
        'agentTool',
        binding,
        structuredClone(sources),
        this.createSourceId,
      )
    } catch (cause) {
      throw collaborationInputError(cause)
    }
    let existingRows: unknown[]
    try {
      const context = this.database.read((database) =>
        database
          .prepare(
            `
            SELECT 1 FROM conversation_turn_contexts
            WHERE conversation_id = ? AND turn_index = ?
          `,
          )
          .get(conversationId, turnIndex),
      )
      if (context === undefined) throw invalidRequest()
      existingRows = this.database.read((database) =>
        database
          .prepare(
            `
            SELECT message_key, snapshot_text FROM channel_sources
            WHERE conversation_id = ? AND turn_index = ?
          `,
          )
          .all(conversationId, turnIndex),
      )
    } catch (cause) {
      if (cause instanceof ConversationCatalogError) throw cause
      throw catalogStorageError(cause)
    }
    const existing = existingRows.map(decodeSourceBoundsRow)
    const existingKeys = new Set(existing.map((value) => value.messageKey))
    const additions = prepared.filter((value) => !existingKeys.has(value.messageKey))
    const totalCharacters =
      existing.reduce((total, value) => total + [...value.text].length, 0) +
      additions.reduce((total, value) => total + [...value.source.text].length, 0)
    if (
      existing.length + additions.length > MAX_SOURCES_PER_TURN ||
      totalCharacters > MAX_SOURCE_TEXT_CHARS_PER_TURN
    ) {
      throw invalidRequest()
    }
    try {
      return this.database.write((database) => insertPreparedSources(database, additions))
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  removeTurnContext(conversationId: string, turnIndex: number): void {
    requireText(conversationId, MAX_ID_CHARS)
    if (!validTurnIndex(turnIndex)) throw invalidRequest()
    if (!this.get(conversationId)) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    try {
      this.database.write((database) =>
        database
          .prepare(
            `
            DELETE FROM conversation_turn_contexts
            WHERE conversation_id = ? AND turn_index = ?
          `,
          )
          .run(conversationId, turnIndex),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  collaborationSnapshot(conversationId: string): CollaborationSnapshot {
    const record = this.get(conversationId)
    if (!record) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    const binding = record.summary.channelBinding
    if (!binding) return { turnContexts: [], drafts: [], deliveries: [] }
    let contextRows: unknown[]
    let sourceRows: unknown[]
    let draftRows: unknown[]
    let deliveryRows: unknown[]
    try {
      ;[contextRows, sourceRows, draftRows, deliveryRows] = this.database.read((database) => [
        database
          .prepare(
            `
            SELECT turn_index, visible_text, created_at
            FROM conversation_turn_contexts
            WHERE conversation_id = ? ORDER BY turn_index
          `,
          )
          .all(conversationId),
        database
          .prepare(
            `
            SELECT source_id, turn_index, origin, message_client_id,
              message_server_id, sender_name, sent_at, sent_by_current_user,
              snapshot_text, captured_at, state, latest_text, last_observed_at
            FROM channel_sources
            WHERE conversation_id = ?
            ORDER BY turn_index, captured_at, rowid
          `,
          )
          .all(conversationId),
        database
          .prepare(
            `
            SELECT draft_id, conversation_id, source_turn_index, source_block_id,
              current_version, content, created_at, updated_at
            FROM channel_drafts
            WHERE conversation_id = ?
            ORDER BY updated_at DESC, draft_id DESC
          `,
          )
          .all(conversationId),
        database
          .prepare(
            `
            SELECT delivery_id, d.draft_id, d.draft_version,
              d.channel_transport_id, d.channel_account_ref, d.channel_ref,
              d.idempotency_key, d.status, d.sent_message_client_id,
              d.sent_message_server_id, d.failure_code, d.created_at, d.updated_at
            FROM channel_deliveries d
            INNER JOIN channel_drafts r ON r.draft_id = d.draft_id
            WHERE r.conversation_id = ?
            ORDER BY d.updated_at DESC, d.delivery_id DESC
          `,
          )
          .all(conversationId),
      ])
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    try {
      const contexts = new Map<number, ConversationTurnContext>()
      for (const row of contextRows) {
        if (!isRecord(row)) throw corruptCatalog()
        const turnIndex = readTurnIndex(row, 'turn_index')
        if (contexts.has(turnIndex)) throw corruptCatalog()
        contexts.set(turnIndex, {
          turnIndex,
          visibleText: requireStoredBoundedText(row.visible_text, MAX_VISIBLE_TEXT_CHARS, false),
          createdAt: requireStoredTimestamp(row.created_at),
          sources: [],
        })
      }
      for (const row of sourceRows) {
        const source = decodeSourceRow(row, conversationId, binding)
        const context = contexts.get(source.turnIndex)
        if (!context) throw corruptCatalog()
        context.sources.push(source)
      }
      for (const context of contexts.values()) validateStoredContextBounds(context)
      return {
        turnContexts: structuredClone([...contexts.values()]),
        drafts: draftRows.map((row) => decodeDraftRow(row, conversationId)),
        deliveries: deliveryRows.map((row) => decodeDeliveryRow(row, binding)),
      }
    } catch (cause) {
      if (cause instanceof ConversationCatalogError && cause.code === 'corruptCatalog') throw cause
      throw corruptCatalog(cause)
    }
  }

  createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
    createdAt: number,
  ): Draft {
    this.requireChannelBinding(conversationId)
    if (!validTurnIndex(sourceTurnIndex)) throw invalidRequest()
    requireText(sourceBlockId, MAX_ID_CHARS)
    const normalizedContent = normalizeDraftContent(content)
    validateTimestamp(createdAt)
    const draft: Draft = {
      draftId: validGeneratedId(this.createDraftId()),
      conversationId,
      sourceTurnIndex,
      sourceBlockId,
      currentVersion: 1,
      content: normalizedContent,
      createdAt,
      updatedAt: createdAt,
    }
    try {
      this.database.write((database) => {
        const context = database
          .prepare(
            `SELECT 1 FROM conversation_turn_contexts
             WHERE conversation_id = ? AND turn_index = ?`,
          )
          .get(conversationId, sourceTurnIndex)
        if (context === undefined) throw invalidRequest()
        database
          .prepare(
            `
            INSERT INTO channel_drafts (
              draft_id, conversation_id, source_turn_index, source_block_id,
              current_version, content, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            draft.draftId,
            draft.conversationId,
            draft.sourceTurnIndex,
            draft.sourceBlockId,
            draft.currentVersion,
            draft.content,
            draft.createdAt,
            draft.updatedAt,
          )
        return undefined
      })
      return structuredClone(draft)
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  updateDraft(draftId: string, content: string, updatedAt: number): Draft {
    requireText(draftId, MAX_ID_CHARS)
    const normalizedContent = normalizeDraftContent(content)
    validateTimestamp(updatedAt)
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare(
            `
            UPDATE channel_drafts
            SET current_version = current_version + 1, content = ?, updated_at = ?
            WHERE draft_id = ? AND current_version < ? AND updated_at <= ?
          `,
          )
          .run(normalizedContent, updatedAt, draftId, MAX_DRAFT_VERSION, updatedAt),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      const existing = this.readDraft(draftId)
      if (!existing) throw invalidRequest()
      throw invalidRequest()
    }
    return this.readDraft(draftId)!
  }

  prepareDelivery(draftId: string, createdAt: number): Delivery {
    requireText(draftId, MAX_ID_CHARS)
    validateTimestamp(createdAt)
    const draft = this.readDraft(draftId)
    if (!draft) throw invalidRequest()
    const binding = this.requireChannelBinding(draft.conversationId)
    const existing = this.readDeliveryForDraftVersion(draftId, draft.currentVersion, binding)
    if (existing) return existing
    const deliveryId = validGeneratedId(this.createDeliveryId())
    const idempotencyKey = deliveryIdempotencyKey(draft)
    validateIdempotencyKey(idempotencyKey)
    try {
      this.database.write((database) =>
        database
          .prepare(
            `
            INSERT INTO channel_deliveries (
              delivery_id, draft_id, draft_version, channel_transport_id,
              channel_account_ref, channel_ref, idempotency_key, status,
              sent_message_client_id, sent_message_server_id, failure_code,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)
          `,
          )
          .run(
            deliveryId,
            draftId,
            draft.currentVersion,
            binding.transportId,
            binding.accountRef,
            binding.channelRef,
            idempotencyKey,
            createdAt,
            createdAt,
          ),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    return this.readDelivery(deliveryId, binding)!
  }

  updateDelivery(
    deliveryId: string,
    status: DeliveryStatus,
    updatedAt: number,
    sentMessageRef?: MessageRef,
    failureCode?: string,
  ): Delivery {
    requireText(deliveryId, MAX_ID_CHARS)
    validateTimestamp(updatedAt)
    const located = this.readDeliveryWithConversation(deliveryId)
    if (!located) throw invalidRequest()
    const current = located.delivery
    if (updatedAt < current.updatedAt) throw invalidRequest()
    const next = transitionDelivery(current, status, sentMessageRef, failureCode, updatedAt)
    try {
      this.database.write((database) =>
        database
          .prepare(
            `
            UPDATE channel_deliveries
            SET status = ?, sent_message_client_id = ?, sent_message_server_id = ?,
              failure_code = ?, updated_at = ?
            WHERE delivery_id = ?
          `,
          )
          .run(
            next.status,
            next.sentMessageRef?.messageClientId ?? null,
            next.sentMessageRef?.messageServerId ?? null,
            next.failureCode ?? null,
            next.updatedAt,
            deliveryId,
          ),
      )
      return structuredClone(next)
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  rename(conversationId: string, title: string, updatedAt: number): ConversationSummary {
    return this.updateSummary(
      conversationId,
      'title',
      normalizeCatalogText(title, MAX_TITLE_CHARS, false),
      updatedAt,
    )
  }

  archive(conversationId: string, archivedAt: number): ConversationSummary {
    return this.updateSummary(conversationId, 'archived_at', archivedAt, archivedAt)
  }

  remove(conversationId: string): void {
    requireText(conversationId, MAX_ID_CHARS)
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare('DELETE FROM runtime_conversations WHERE conversation_id = ?')
          .run(conversationId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
  }

  updateActivity(
    conversationId: string,
    titleIfMissing: string | undefined,
    lastMessagePreview: string,
    updatedAt: number,
  ): ConversationSummary {
    requireText(conversationId, MAX_ID_CHARS)
    const title =
      titleIfMissing === undefined
        ? null
        : normalizeCatalogText(titleIfMissing, MAX_TITLE_CHARS, false)
    const preview = normalizeCatalogText(lastMessagePreview, MAX_PREVIEW_CHARS, false)
    validateTimestamp(updatedAt)
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare(
            `
            UPDATE runtime_conversations
            SET title = COALESCE(title, ?), last_message_preview = ?,
              updated_at = MAX(updated_at, ?)
            WHERE conversation_id = ?
          `,
          )
          .run(title, preview, updatedAt, conversationId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    return this.get(conversationId)!.summary
  }

  setTitleIfMissing(conversationId: string, title: string): ConversationSummary {
    requireText(conversationId, MAX_ID_CHARS)
    const normalized = normalizeCatalogText(title, MAX_TITLE_CHARS, false)
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare(
            `
            UPDATE runtime_conversations SET title = COALESCE(title, ?)
            WHERE conversation_id = ?
          `,
          )
          .run(normalized, conversationId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    return this.get(conversationId)!.summary
  }

  recordRestoreFailure(conversationId: string, failure: ConversationRestoreFailure): void {
    requireText(conversationId, MAX_ID_CHARS)
    const value = validateRestoreFailure(failure)
    this.updateRestoreFailure(conversationId, value.code, value.failedAt)
  }

  clearRestoreFailure(conversationId: string): void {
    requireText(conversationId, MAX_ID_CHARS)
    this.updateRestoreFailure(conversationId, null, null)
  }

  close(): void {
    try {
      this.database.close()
    } catch (cause) {
      throw catalogStorageError(cause)
    }
  }

  private readDraft(draftId: string): Draft | null {
    let row: unknown
    try {
      row = this.database.read((database) =>
        database
          .prepare(
            `
            SELECT draft_id, conversation_id, source_turn_index, source_block_id,
              current_version, content, created_at, updated_at
            FROM channel_drafts WHERE draft_id = ?
          `,
          )
          .get(draftId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    return row === undefined ? null : decodeDraftRow(row)
  }

  private readDeliveryForDraftVersion(
    draftId: string,
    draftVersion: number,
    binding: ChannelBinding,
  ): Delivery | null {
    let row: unknown
    try {
      row = this.database.read((database) =>
        database
          .prepare(
            `
            SELECT delivery_id, draft_id, draft_version, channel_transport_id,
              channel_account_ref, channel_ref, idempotency_key, status,
              sent_message_client_id, sent_message_server_id, failure_code,
              created_at, updated_at
            FROM channel_deliveries
            WHERE draft_id = ? AND draft_version = ?
          `,
          )
          .get(draftId, draftVersion),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    return row === undefined ? null : decodeDeliveryRow(row, binding)
  }

  private readDelivery(deliveryId: string, binding: ChannelBinding): Delivery | null {
    let row: unknown
    try {
      row = this.database.read((database) =>
        database
          .prepare(
            `
            SELECT delivery_id, draft_id, draft_version, channel_transport_id,
              channel_account_ref, channel_ref, idempotency_key, status,
              sent_message_client_id, sent_message_server_id, failure_code,
              created_at, updated_at
            FROM channel_deliveries WHERE delivery_id = ?
          `,
          )
          .get(deliveryId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    return row === undefined ? null : decodeDeliveryRow(row, binding)
  }

  private readDeliveryWithConversation(
    deliveryId: string,
  ): { delivery: Delivery; conversationId: string } | null {
    let row: unknown
    try {
      row = this.database.read((database) =>
        database
          .prepare(
            `
            SELECT d.delivery_id, d.draft_id, d.draft_version,
              d.channel_transport_id, d.channel_account_ref, d.channel_ref,
              d.idempotency_key, d.status, d.sent_message_client_id,
              d.sent_message_server_id, d.failure_code, d.created_at, d.updated_at,
              r.conversation_id
            FROM channel_deliveries d
            INNER JOIN channel_drafts r ON r.draft_id = d.draft_id
            WHERE d.delivery_id = ?
          `,
          )
          .get(deliveryId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (row === undefined) return null
    if (!isRecord(row)) throw corruptCatalog()
    const conversationId = requireStoredIdentifier(row.conversation_id)
    const binding = this.requireChannelBinding(conversationId)
    return { delivery: decodeDeliveryRow(row, binding), conversationId }
  }

  private updateSummary(
    conversationId: string,
    field: 'title' | 'archived_at',
    value: string | number,
    updatedAt: number,
  ): ConversationSummary {
    requireText(conversationId, MAX_ID_CHARS)
    validateTimestamp(updatedAt)
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) => {
        const statement =
          field === 'title'
            ? `UPDATE runtime_conversations
               SET title = ?, updated_at = MAX(updated_at, ?)
               WHERE conversation_id = ?`
            : `UPDATE runtime_conversations
               SET archived_at = ?, updated_at = MAX(updated_at, ?)
               WHERE conversation_id = ?`
        return database.prepare(statement).run(value, updatedAt, conversationId)
      })
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    return this.get(conversationId)!.summary
  }

  private updateRestoreFailure(
    conversationId: string,
    code: string | null,
    failedAt: number | null,
  ): void {
    let result: { changes: number | bigint }
    try {
      result = this.database.write((database) =>
        database
          .prepare(
            `
            UPDATE runtime_conversations
            SET last_restore_failure_code = ?, last_restore_failed_at = ?
            WHERE conversation_id = ?
          `,
          )
          .run(code, failedAt, conversationId),
      )
    } catch (cause) {
      throw catalogStorageError(cause)
    }
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
  }

  private requireChannelBinding(conversationId: string): ChannelBinding {
    const record = this.get(conversationId)
    if (!record) {
      throw new ConversationCatalogError(
        'unknownConversation',
        `conversation is not cataloged: ${conversationId}`,
      )
    }
    if (!record.summary.channelBinding) throw invalidRequest()
    return record.summary.channelBinding
  }
}

const SELECT_COLUMNS = `
  SELECT conversation_id, runtime_id, native_session_id, workspace_id, working_directory,
    idempotency_key, binding_json, title, last_message_preview, created_at,
    updated_at, archived_at, channel_transport_id, channel_account_ref,
    channel_ref, last_restore_failure_code, last_restore_failed_at
  FROM runtime_conversations
`

interface CatalogCursor {
  updatedAt: number
  conversationId: string
}

function validateRecord(value: ConversationCatalogRecord): ConversationCatalogRecord {
  const summary = value.summary
  requireText(summary.conversationId, MAX_ID_CHARS)
  requireText(summary.runtimeId, MAX_ID_CHARS)
  requireText(summary.workspaceId, MAX_ID_CHARS)
  if (summary.workingDirectory !== undefined) validateWorkingDirectory(summary.workingDirectory)
  requireText(value.nativeSessionId, MAX_ID_CHARS)
  validateIdempotencyKey(value.idempotencyKey)
  validateTimestamp(summary.createdAt)
  validateTimestamp(summary.updatedAt)
  if (summary.updatedAt < summary.createdAt) throw invalidRequest()
  if (summary.archivedAt !== undefined) validateTimestamp(summary.archivedAt)
  if (summary.title !== undefined) requireText(summary.title, MAX_TITLE_CHARS)
  if (summary.lastMessagePreview !== undefined) {
    requireText(summary.lastMessagePreview, MAX_PREVIEW_CHARS)
  }
  if (summary.channelBinding) validateChannelBinding(summary.channelBinding)
  let binding: RuntimeConversationBinding
  try {
    binding = parseRuntimeConversationBinding(value.binding)
  } catch {
    throw invalidRequest()
  }
  if (
    binding.runtimeId !== summary.runtimeId ||
    binding.nativeSessionId !== value.nativeSessionId ||
    binding.workspacePath !== summary.workingDirectory
  ) {
    throw invalidRequest()
  }
  const failure = value.lastRestoreFailure
    ? validateRestoreFailure(value.lastRestoreFailure)
    : undefined
  return structuredClone({
    summary,
    nativeSessionId: value.nativeSessionId,
    idempotencyKey: value.idempotencyKey,
    binding,
    ...(failure ? { lastRestoreFailure: failure } : {}),
  })
}

function sameBindingExceptWorkspace(
  left: RuntimeConversationBinding,
  right: RuntimeConversationBinding,
): boolean {
  return isDeepStrictEqual({ ...left, workspacePath: '' }, { ...right, workspacePath: '' })
}

function validateWorkingDirectory(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_WORKING_DIRECTORY_CHARS ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n') ||
    !path.isAbsolute(value)
  ) {
    throw invalidRequest()
  }
}

function requireStoredWorkingDirectory(value: unknown): string {
  try {
    validateWorkingDirectory(value)
    return value
  } catch {
    throw corruptCatalog()
  }
}

function decodeRow(value: unknown): ConversationCatalogRecord {
  if (!isRecord(value)) throw corruptCatalog()
  const bindingJson = value.binding_json
  if (
    typeof bindingJson !== 'string' ||
    Buffer.byteLength(bindingJson, 'utf8') > MAX_BINDING_BYTES
  ) {
    throw corruptCatalog()
  }
  let bindingValue: unknown
  try {
    bindingValue = JSON.parse(bindingJson)
  } catch {
    throw corruptCatalog()
  }
  let binding: RuntimeConversationBinding
  try {
    binding = parseRuntimeConversationBinding(bindingValue)
  } catch (cause) {
    throw corruptCatalog(cause)
  }
  const channelBinding = decodeChannelBinding(value)
  const restoreFailure = decodeRestoreFailure(value)
  const record: ConversationCatalogRecord = {
    summary: {
      conversationId: requireStoredText(value.conversation_id, MAX_ID_CHARS),
      runtimeId: requireStoredText(value.runtime_id, MAX_ID_CHARS),
      workspaceId: requireStoredText(value.workspace_id, MAX_ID_CHARS),
      ...(value.working_directory === null
        ? {}
        : { workingDirectory: requireStoredWorkingDirectory(value.working_directory) }),
      createdAt: requireStoredTimestamp(value.created_at),
      updatedAt: requireStoredTimestamp(value.updated_at),
      ...(value.title === null ? {} : { title: requireStoredText(value.title, MAX_TITLE_CHARS) }),
      ...(value.last_message_preview === null
        ? {}
        : {
            lastMessagePreview: requireStoredText(value.last_message_preview, MAX_PREVIEW_CHARS),
          }),
      ...(value.archived_at === null
        ? {}
        : { archivedAt: requireStoredTimestamp(value.archived_at) }),
      ...(channelBinding ? { channelBinding } : {}),
    },
    nativeSessionId: requireStoredText(value.native_session_id, MAX_ID_CHARS),
    idempotencyKey: requireStoredIdempotencyKey(value.idempotency_key),
    binding,
    ...(restoreFailure ? { lastRestoreFailure: restoreFailure } : {}),
  }
  try {
    return validateRecord(record)
  } catch (cause) {
    if (cause instanceof ConversationCatalogError && cause.code === 'corruptCatalog') throw cause
    throw corruptCatalog(cause)
  }
}

function decodeChannelBinding(value: Record<string, unknown>): ChannelBinding | undefined {
  const values = [value.channel_transport_id, value.channel_account_ref, value.channel_ref]
  if (values.every((item) => item === null)) return undefined
  if (values.some((item) => item === null)) throw corruptCatalog()
  return {
    transportId: requireStoredText(values[0], MAX_ID_CHARS),
    accountRef: requireStoredText(values[1], MAX_ID_CHARS),
    channelRef: requireStoredText(values[2], MAX_ID_CHARS),
  }
}

function decodeRestoreFailure(
  value: Record<string, unknown>,
): ConversationRestoreFailure | undefined {
  const code = value.last_restore_failure_code
  const failedAt = value.last_restore_failed_at
  if (code === null && failedAt === null) return undefined
  if (code === null || failedAt === null) throw corruptCatalog()
  try {
    return validateRestoreFailure({
      code: requireStoredText(code, MAX_FAILURE_CODE_CHARS),
      failedAt: requireStoredTimestamp(failedAt),
    })
  } catch (cause) {
    throw corruptCatalog(cause)
  }
}

function decodeDraftRow(value: unknown, expectedConversationId?: string): Draft {
  if (!isRecord(value)) throw corruptCatalog()
  const conversationId = requireStoredIdentifier(value.conversation_id)
  if (expectedConversationId !== undefined && conversationId !== expectedConversationId) {
    throw corruptCatalog()
  }
  const sourceTurnIndex = readNumericIndex(value.source_turn_index)
  const currentVersion = readPositiveVersion(value.current_version)
  const content = requireStoredBoundedText(value.content, MAX_DRAFT_CONTENT_CHARS, false)
  const createdAt = requireStoredTimestamp(value.created_at)
  const updatedAt = requireStoredTimestamp(value.updated_at)
  if (updatedAt < createdAt) throw corruptCatalog()
  return {
    draftId: requireStoredIdentifier(value.draft_id),
    conversationId,
    sourceTurnIndex,
    sourceBlockId: requireStoredIdentifier(value.source_block_id),
    currentVersion,
    content,
    createdAt,
    updatedAt,
  }
}

function decodeDeliveryRow(value: unknown, expectedBinding: ChannelBinding): Delivery {
  if (!isRecord(value)) throw corruptCatalog()
  const binding: ChannelBinding = {
    transportId: requireStoredIdentifier(value.channel_transport_id),
    accountRef: requireStoredIdentifier(value.channel_account_ref),
    channelRef: requireStoredIdentifier(value.channel_ref),
  }
  if (!sameChannelBinding(binding, expectedBinding)) throw corruptCatalog()
  const status = requireStoredDeliveryStatus(value.status)
  const messageClientId =
    value.sent_message_client_id === null
      ? undefined
      : requireStoredIdentifier(value.sent_message_client_id)
  const messageServerId =
    value.sent_message_server_id === null
      ? undefined
      : requireStoredIdentifier(value.sent_message_server_id)
  const failureCode =
    value.failure_code === null ? undefined : requireStoredFailureCode(value.failure_code)
  if (
    (status === 'sent' && (!messageClientId || failureCode !== undefined)) ||
    (status === 'failed' && (messageClientId !== undefined || failureCode === undefined)) ||
    ((status === 'pending' || status === 'sending') &&
      (messageClientId !== undefined || messageServerId !== undefined || failureCode !== undefined))
  ) {
    throw corruptCatalog()
  }
  const createdAt = requireStoredTimestamp(value.created_at)
  const updatedAt = requireStoredTimestamp(value.updated_at)
  if (updatedAt < createdAt) throw corruptCatalog()
  return {
    deliveryId: requireStoredIdentifier(value.delivery_id),
    draftId: requireStoredIdentifier(value.draft_id),
    draftVersion: readPositiveVersion(value.draft_version),
    channelBinding: binding,
    idempotencyKey: requireStoredIdempotencyKey(value.idempotency_key),
    status,
    ...(messageClientId
      ? {
          sentMessageRef: {
            channelRef: binding.channelRef,
            messageClientId,
            ...(messageServerId ? { messageServerId } : {}),
          },
        }
      : {}),
    ...(failureCode ? { failureCode } : {}),
    createdAt,
    updatedAt,
  }
}

function transitionDelivery(
  current: Delivery,
  status: DeliveryStatus,
  sentMessageRef: MessageRef | undefined,
  failureCode: string | undefined,
  updatedAt: number,
): Delivery {
  if (status === 'sending') {
    if (current.status === 'sent') throw invalidRequest()
    return {
      ...withoutDeliveryOutcome(current),
      status,
      updatedAt,
    }
  }
  if (status === 'sent') {
    if (!sentMessageRef) throw invalidRequest()
    validateMessageRef(sentMessageRef, current.channelBinding)
    if (current.status === 'pending') throw invalidRequest()
    if (current.status === 'sent' && !sameMessageRef(current.sentMessageRef, sentMessageRef)) {
      throw invalidRequest()
    }
    return {
      ...withoutDeliveryOutcome(current),
      status,
      updatedAt,
      sentMessageRef: structuredClone(sentMessageRef),
    }
  }
  if (status === 'failed') {
    if (current.status === 'pending' || current.status === 'sent') throw invalidRequest()
    const code = validateFailureCode(failureCode)
    return {
      ...withoutDeliveryOutcome(current),
      status,
      updatedAt,
      failureCode: code,
    }
  }
  throw invalidRequest()
}

function withoutDeliveryOutcome(value: Delivery): Omit<Delivery, 'sentMessageRef' | 'failureCode'> {
  const copy = structuredClone(value)
  delete copy.sentMessageRef
  delete copy.failureCode
  return copy
}

function deliveryIdempotencyKey(draft: Draft): string {
  const digest = createHash('sha256')
    .update(`${draft.conversationId}\0${draft.draftId}\0${draft.currentVersion}`, 'utf8')
    .digest('hex')
  return `channel-delivery:v1:${digest}`
}

function validateRestoreFailure(value: ConversationRestoreFailure): ConversationRestoreFailure {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value.code)) throw invalidRequest()
  validateTimestamp(value.failedAt)
  return structuredClone(value)
}

function validateIdempotencyKey(value: string): void {
  if (!new RegExp(`^[A-Za-z0-9._:-]{1,${MAX_IDEMPOTENCY_KEY_CHARS}}$`).test(value)) {
    throw invalidRequest()
  }
}

function validatePageLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_PAGE_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) throw invalidRequest()
  return limit
}

function validateFilter(value: ConversationScopeFilter): ConversationScopeFilter {
  if (value.kind === 'binding') validateChannelBinding(value.binding)
  else if (value.kind !== 'all' && value.kind !== 'local' && value.kind !== 'channel') {
    throw invalidRequest()
  }
  return structuredClone(value)
}

function validateChannelBinding(value: ChannelBinding): void {
  requireText(value.transportId, MAX_ID_CHARS)
  requireText(value.accountRef, MAX_ID_CHARS)
  requireText(value.channelRef, MAX_ID_CHARS)
}

function validateMessageRef(value: MessageRef, binding: ChannelBinding): void {
  if (value.channelRef !== binding.channelRef) throw invalidRequest()
  requireText(value.messageClientId, MAX_ID_CHARS)
  if (value.messageServerId !== undefined) requireText(value.messageServerId, MAX_ID_CHARS)
}

function sameChannelBinding(left: ChannelBinding, right: ChannelBinding): boolean {
  return (
    left.transportId === right.transportId &&
    left.accountRef === right.accountRef &&
    left.channelRef === right.channelRef
  )
}

function sameMessageRef(left: MessageRef | undefined, right: MessageRef): boolean {
  return (
    left?.channelRef === right.channelRef &&
    left.messageClientId === right.messageClientId &&
    left.messageServerId === right.messageServerId
  )
}

function appendFilter(
  conditions: string[],
  parameters: SQLInputValue[],
  filter: ConversationScopeFilter,
): void {
  if (filter.kind === 'local') conditions.push('channel_ref IS NULL')
  if (filter.kind === 'channel') conditions.push('channel_ref IS NOT NULL')
  if (filter.kind === 'binding') {
    conditions.push('channel_transport_id = ? AND channel_account_ref = ? AND channel_ref = ?')
    parameters.push(
      filter.binding.transportId,
      filter.binding.accountRef,
      filter.binding.channelRef,
    )
  }
}

function encodeCursor(value: CatalogCursor): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      updatedAt: value.updatedAt,
      conversationId: value.conversationId,
    }),
    'utf8',
  ).toString('base64url')
}

function decodeCursor(value: string | undefined): CatalogCursor | undefined {
  if (value === undefined) return undefined
  if (!value || value.length > MAX_CURSOR_CHARS || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidRequest()
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    throw invalidRequest()
  }
  if (
    !isRecord(decoded) ||
    !hasExactKeys(decoded, ['version', 'updatedAt', 'conversationId']) ||
    decoded.version !== 1
  ) {
    throw invalidRequest()
  }
  validateTimestamp(decoded.updatedAt)
  requireText(decoded.conversationId, MAX_ID_CHARS)
  return { updatedAt: decoded.updatedAt, conversationId: decoded.conversationId }
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
    throw invalidRequest()
  }
}

function requireStoredText(value: unknown, maxChars: number): string {
  try {
    requireText(value, maxChars)
    return value
  } catch (cause) {
    throw corruptCatalog(cause)
  }
}

function requireStoredIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string') throw corruptCatalog()
  try {
    validateIdempotencyKey(value)
    return value
  } catch (cause) {
    throw corruptCatalog(cause)
  }
}

function validateTimestamp(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidRequest()
}

function requireStoredTimestamp(value: unknown): number {
  try {
    validateTimestamp(value)
    return value
  } catch (cause) {
    throw corruptCatalog(cause)
  }
}

function readNumericIndex(value: unknown): number {
  if (!validTurnIndex(value)) throw corruptCatalog()
  return value
}

function readPositiveVersion(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_DRAFT_VERSION
  ) {
    throw corruptCatalog()
  }
  return value as number
}

function validGeneratedId(value: unknown): string {
  requireText(value, MAX_ID_CHARS)
  return value
}

function normalizeDraftContent(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\0')) throw invalidRequest()
  const normalized = value.trim()
  if (normalized.length === 0 || [...normalized].length > MAX_DRAFT_CONTENT_CHARS) {
    throw invalidRequest()
  }
  return normalized
}

function validateFailureCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw invalidRequest()
  }
  return value
}

function requireStoredFailureCode(value: unknown): string {
  try {
    return validateFailureCode(value)
  } catch (cause) {
    throw corruptCatalog(cause)
  }
}

function requireStoredDeliveryStatus(value: unknown): DeliveryStatus {
  if (value !== 'pending' && value !== 'sending' && value !== 'sent' && value !== 'failed') {
    throw corruptCatalog()
  }
  return value
}

function insertPreparedSources(
  database: DatabaseSync,
  prepared: PreparedChannelSource[],
): ChannelSource[] {
  const statement = database.prepare(
    `
    INSERT INTO channel_sources (
      source_id, conversation_id, turn_index, origin, message_key,
      message_client_id, message_server_id, sender_name, sent_at,
      sent_by_current_user, snapshot_text, captured_at, state,
      latest_text, last_observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT(conversation_id, turn_index, message_key) DO NOTHING
  `,
  )
  const inserted: ChannelSource[] = []
  for (const value of prepared) {
    const source = value.source
    const result = statement.run(
      source.sourceId,
      source.conversationId,
      source.turnIndex,
      source.origin,
      value.messageKey,
      source.messageRef.messageClientId,
      source.messageRef.messageServerId ?? null,
      source.senderName,
      source.sentAt,
      source.sentByCurrentUser ? 1 : 0,
      source.text,
      source.capturedAt,
      source.state,
    )
    if (result.changes === 1 || result.changes === 1n) inserted.push(structuredClone(source))
  }
  return inserted
}

function readTurnIndex(value: unknown, key: 'turn_index' | 'next_turn_index'): number {
  if (!isRecord(value)) throw corruptCatalog()
  const candidate = key === 'turn_index' ? value.turn_index : value.next_turn_index
  if (!validTurnIndex(candidate)) throw corruptCatalog()
  return candidate
}

function decodeSourceBoundsRow(value: unknown): { messageKey: string; text: string } {
  if (!isRecord(value)) throw corruptCatalog()
  return {
    messageKey: requireStoredBoundedText(value.message_key, 1_100, false),
    text: requireStoredBoundedText(value.snapshot_text, MAX_SOURCE_TEXT_CHARS, true),
  }
}

function decodeSourceRow(
  value: unknown,
  conversationId: string,
  binding: ChannelBinding,
): ChannelSource {
  if (!isRecord(value)) throw corruptCatalog()
  const sourceId = requireStoredIdentifier(value.source_id)
  const turnIndex = readTurnIndex(value, 'turn_index')
  const origin = requireStoredSourceOrigin(value.origin)
  const messageClientId = requireStoredIdentifier(value.message_client_id)
  const messageServerId =
    value.message_server_id === null ? undefined : requireStoredIdentifier(value.message_server_id)
  const state = requireStoredSourceState(value.state)
  const text = requireStoredBoundedText(value.snapshot_text, MAX_SOURCE_TEXT_CHARS, true)
  if ((state === 'revoked' || state === 'deleted') && text !== '') throw corruptCatalog()
  if (value.sent_by_current_user !== 0 && value.sent_by_current_user !== 1) {
    throw corruptCatalog()
  }
  const latestText =
    value.latest_text === null
      ? undefined
      : requireStoredBoundedText(value.latest_text, MAX_SOURCE_TEXT_CHARS, true)
  const lastObservedAt =
    value.last_observed_at === null ? undefined : requireStoredTimestamp(value.last_observed_at)
  return {
    sourceId,
    conversationId,
    turnIndex,
    origin,
    messageRef: {
      channelRef: binding.channelRef,
      messageClientId,
      ...(messageServerId ? { messageServerId } : {}),
    },
    senderName: requireStoredBoundedText(value.sender_name, 128, false),
    sentAt: requireStoredTimestamp(value.sent_at),
    sentByCurrentUser: value.sent_by_current_user === 1,
    text,
    capturedAt: requireStoredTimestamp(value.captured_at),
    state,
    ...(latestText === undefined ? {} : { latestText }),
    ...(lastObservedAt === undefined ? {} : { lastObservedAt }),
  }
}

function validateStoredContextBounds(context: ConversationTurnContext): void {
  if (context.sources.length > MAX_SOURCES_PER_TURN) throw corruptCatalog()
  const totalCharacters = context.sources.reduce(
    (total, source) => total + [...source.text].length,
    0,
  )
  if (totalCharacters > MAX_SOURCE_TEXT_CHARS_PER_TURN) throw corruptCatalog()
}

function requireStoredIdentifier(value: unknown): string {
  const identifier = requireStoredText(value, MAX_ID_CHARS)
  if (Buffer.byteLength(identifier, 'utf8') > 512) throw corruptCatalog()
  return identifier
}

function requireStoredBoundedText(value: unknown, maximum: number, allowEmpty: boolean): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.trim().length === 0) ||
    [...value].length > maximum ||
    value.includes('\0')
  ) {
    throw corruptCatalog()
  }
  return value
}

function normalizeCatalogText(value: string, maximum: number, allowEmpty: boolean): string {
  const normalized = [...value.trim()]
    .filter((character) => !/\p{Cc}/u.test(character))
    .slice(0, maximum)
    .join('')
    .trim()
  if ((!allowEmpty && normalized.length === 0) || normalized.includes('\0')) throw invalidRequest()
  return normalized
}

function requireStoredSourceOrigin(value: unknown): ChannelSourceOrigin {
  if (value !== 'userForwarded' && value !== 'agentTool') throw corruptCatalog()
  return value
}

function requireStoredSourceState(value: unknown): ChannelSourceState {
  if (value !== 'active' && value !== 'modified' && value !== 'revoked' && value !== 'deleted') {
    throw corruptCatalog()
  }
  return value
}

function collaborationInputError(cause: unknown): ConversationCatalogError {
  return cause instanceof ConversationCatalogError
    ? cause
    : new ConversationCatalogError(
        'invalidRequest',
        'conversation collaboration input is invalid',
        false,
        cause instanceof ConversationCollaborationError ? { cause } : undefined,
      )
}

function catalogStorageError(cause: unknown): ConversationCatalogError {
  if (cause instanceof ConversationCatalogError) return cause
  if (cause instanceof MainDatabaseError) {
    return new ConversationCatalogError(cause.code, cause.message, cause.retryable, { cause })
  }
  return new ConversationCatalogError(
    'storageFailure',
    'conversation catalog storage failed',
    true,
    { cause },
  )
}

function invalidRequest(): ConversationCatalogError {
  return new ConversationCatalogError('invalidRequest', 'conversation catalog request is invalid')
}

function corruptCatalog(cause?: unknown): ConversationCatalogError {
  return new ConversationCatalogError(
    'corruptCatalog',
    'conversation catalog row is invalid',
    false,
    cause === undefined ? undefined : { cause },
  )
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
