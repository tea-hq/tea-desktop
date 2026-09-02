import type {
  ChannelRef,
  ChannelTransport,
  Message,
  MessageRef,
} from '@/features/channels/contracts'
import { sameMessage } from '@/features/channels/projection'
import type {
  ConversationJson,
  HostToolCall,
  HostToolFailureCode,
  HostToolResult,
} from '@/features/conversation/contracts'
import {
  CHANNEL_HISTORY_TOOL_NAME,
  channelHistoryToolDefinition,
} from '@/features/conversation/hostToolCatalog'
import type { ChannelSourceInput } from '@/types/channelCollaboration'
import { messageContentToText } from '@/features/channels/messageContent'

const MAX_CALLS = 6
const MAX_MESSAGES_PER_CALL = 10
const MAX_UNIQUE_REFS = 40
const MAX_RETURNED_CHARS = 32_000
const MAX_MESSAGE_CHARS = 4_000

export { CHANNEL_HISTORY_TOOL_NAME, channelHistoryToolDefinition }

export interface ChannelHistoryToolOutcome {
  result: HostToolResult
  loadedSources: ChannelSourceInput[]
}

interface SanitizedMessage extends Record<string, ConversationJson> {
  ref: Record<string, ConversationJson>
  sender: string
  sentAt: number
  sentByCurrentUser: boolean
  state: Message['state']
  text: string
}

export class ChannelHistoryToolScope {
  private readonly knownRefs: MessageRef[]
  private callCount = 0
  private returnedChars = 0

  constructor(
    private readonly transport: ChannelTransport,
    private readonly channelRef: ChannelRef,
    knownRefs: MessageRef[] = [],
  ) {
    this.knownRefs = knownRefs.map((ref) => ({ ...ref }))
  }

  async execute(call: HostToolCall): Promise<ChannelHistoryToolOutcome> {
    if (call.name !== CHANNEL_HISTORY_TOOL_NAME) return this.failure(call, 'unavailable')
    if (this.callCount >= MAX_CALLS) return this.failure(call, 'limitExceeded')
    const parsed = parseArguments(call.arguments)
    if (!parsed) return this.failure(call, 'invalidRequest')
    const cursor = parsed.cursor ? (this.resolveCursor(parsed.cursor) ?? undefined) : undefined
    if (parsed.cursor && !cursor) return this.failure(call, 'invalidRequest')
    if (!cursor && parsed.direction !== 'before') return this.failure(call, 'invalidRequest')
    this.callCount += 1

    try {
      const page = await this.transport.loadMessages({
        channelRef: this.channelRef,
        direction: parsed.direction,
        limit: parsed.limit,
        anchorMessage: cursor,
      })
      if (
        page.channelRef !== this.channelRef ||
        page.items.some((message) => message.ref.channelRef !== this.channelRef)
      ) {
        return this.failure(call, 'executionFailed')
      }
      const sanitized = page.items.map(sanitizeMessage)
      const loadedRefs = page.items.map((message) => ({ ...message.ref }))
      const loadedSources = page.items.map(toSourceInput)
      const newRefs = loadedRefs.filter(
        (ref) => !this.knownRefs.some((value) => sameMessage(value, ref)),
      )
      const addedChars = sanitized.reduce((total, message) => total + message.text.length, 0)
      if (
        this.knownRefs.length + newRefs.length > MAX_UNIQUE_REFS ||
        this.returnedChars + addedChars > MAX_RETURNED_CHARS
      ) {
        return this.failure(call, 'limitExceeded')
      }
      this.knownRefs.push(...newRefs)
      this.returnedChars += addedChars
      const nextCursor = page.nextAnchor ? modelCursor(page.nextAnchor) : null
      const output = {
        direction: parsed.direction,
        messages: sanitized,
        hasMore: page.hasMore,
        nextCursor,
      } satisfies Record<string, ConversationJson>
      return {
        result: {
          conversationId: call.conversationId,
          callId: call.callId,
          status: 'success',
          output,
        },
        loadedSources,
      }
    } catch {
      return this.failure(call, 'unavailable')
    }
  }

  private resolveCursor(cursor: ModelCursor): MessageRef | null {
    return (
      this.knownRefs.find(
        (ref) =>
          ref.messageClientId === cursor.messageClientId &&
          (cursor.messageServerId === undefined || ref.messageServerId === cursor.messageServerId),
      ) ?? null
    )
  }

  private failure(call: HostToolCall, code: HostToolFailureCode): ChannelHistoryToolOutcome {
    return {
      result: { conversationId: call.conversationId, callId: call.callId, status: 'failure', code },
      loadedSources: [],
    }
  }
}

interface ModelCursor {
  messageClientId: string
  messageServerId?: string
}

interface ParsedArguments {
  direction: 'before' | 'after'
  cursor?: ModelCursor
  limit: number
}

function parseArguments(value: Record<string, ConversationJson>): ParsedArguments | null {
  const keys = Object.keys(value)
  if (keys.some((key) => !['direction', 'cursor', 'limit'].includes(key))) return null
  if (value.direction !== 'before' && value.direction !== 'after') return null
  const limit = value.limit === undefined ? MAX_MESSAGES_PER_CALL : value.limit
  if (
    !Number.isInteger(limit) ||
    typeof limit !== 'number' ||
    limit < 1 ||
    limit > MAX_MESSAGES_PER_CALL
  )
    return null
  if (value.cursor === undefined) return { direction: value.direction, limit }
  if (!isRecord(value.cursor)) return null
  const cursorKeys = Object.keys(value.cursor)
  if (cursorKeys.some((key) => !['messageClientId', 'messageServerId'].includes(key))) return null
  const messageClientId = value.cursor.messageClientId
  const messageServerId = value.cursor.messageServerId
  if (!validId(messageClientId) || (messageServerId !== undefined && !validId(messageServerId)))
    return null
  return { direction: value.direction, limit, cursor: { messageClientId, messageServerId } }
}

function sanitizeMessage(message: Message): SanitizedMessage {
  const text = message.state === 'revoked' ? '' : messageContentToText(message.content)
  return {
    ref: modelCursor(message.ref),
    sender: message.sender.name.trim().slice(0, 128),
    sentAt: message.sentAt,
    sentByCurrentUser: message.sentByCurrentUser,
    state: message.state,
    text: text.trim().slice(0, MAX_MESSAGE_CHARS),
  }
}

function toSourceInput(message: Message): ChannelSourceInput {
  const text = message.state === 'revoked' ? '' : messageContentToText(message.content)
  return {
    messageRef: { ...message.ref },
    senderName: message.sender.name.trim().slice(0, 128),
    sentAt: message.sentAt,
    sentByCurrentUser: message.sentByCurrentUser,
    text: text.trim().slice(0, MAX_MESSAGE_CHARS),
    capturedAt: Date.now(),
    state: message.state,
  }
}

function modelCursor(ref: MessageRef): Record<string, ConversationJson> {
  return ref.messageServerId
    ? { messageClientId: ref.messageClientId, messageServerId: ref.messageServerId }
    : { messageClientId: ref.messageClientId }
}

function isRecord(value: ConversationJson): value is { [key: string]: ConversationJson } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validId(value: ConversationJson | undefined): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0')
  )
}
