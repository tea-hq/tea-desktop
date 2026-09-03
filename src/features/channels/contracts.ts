import type { ChannelRef, MessageRef } from '@/types/channelCollaboration'

export type { ChannelRef, MessageRef } from '@/types/channelCollaboration'

export type ChannelKind = 'group' | 'direct'
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface Participant {
  id: string
  name: string
  avatarUrl?: string
  isCurrentUser: boolean
}

export interface Channel {
  ref: ChannelRef
  kind: ChannelKind
  name: string
  /** Stable IM account for a direct conversation, when the provider exposes it. */
  participantAccountId?: string
  avatarUrl?: string
  description: string
  memberCount?: number
  unreadCount: number
  updatedAt: number
  lastMessagePreview?: string
  lastReadAt?: number
}

export type MessageState = 'active' | 'revoked'

export interface MessageReceipt {
  readCount?: number
  unreadCount?: number
  readAt?: number
}

export interface MessageReaction {
  type: number
  count: number
  active: boolean
}

export interface Message {
  ref: MessageRef
  sender: Participant
  sentAt: number
  text: string
  state: MessageState
  sentByCurrentUser: boolean
  serverExtension?: JsonValue
  pinned: boolean
  reactions: MessageReaction[]
  receipt?: MessageReceipt
}

export interface ChannelPage {
  items: Channel[]
  nextOffset: number
  hasMore: boolean
}

export interface MessagePage {
  channelRef: ChannelRef
  items: Message[]
  hasMore: boolean
  nextAnchor?: MessageRef
}

export type ChannelConnectionPhase =
  | 'disconnected'
  | 'connecting'
  | 'synchronizing'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'kickedOffline'

export interface ChannelStatus {
  phase: ChannelConnectionPhase
  account?: string
  accountRef?: string
  errorCode?: string
  retryable: boolean
}

export type ChannelCapabilityId =
  | 'channel.list'
  | 'profile.self'
  | 'message.history'
  | 'message.send.text'
  | 'channel.read'
  | 'message.modify.events'
  | 'message.delete.events'
  | 'message.revoke.events'
  | 'message.pin.events'
  | 'message.quickComment'
  | 'message.receipt.events'

export interface ChannelCapability {
  id: ChannelCapabilityId
  available: boolean
  reason?: 'unsupported' | 'notVerified' | 'notConnected'
}

export interface ChannelTransportDescriptor {
  id: string
  displayName: string
  protocolVersion: 1
  capabilities: ChannelCapability[]
}

export interface ChannelUserProfile {
  accountId: string
  name: string
  email?: string
  avatarUrl?: string
}

export type ChannelSelfProfile = ChannelUserProfile

export interface ChannelUserProfileClient {
  getUserProfiles(accountIds: string[]): Promise<ChannelUserProfile[]>
}

export interface ListChannelsRequest {
  offset: number
  limit: number
}

export interface LoadMessagesRequest {
  channelRef: ChannelRef
  direction: 'before' | 'after'
  limit: number
  anchorMessage?: MessageRef
}

export interface SendMessageRequest {
  channelRef: ChannelRef
  text: string
  serverExtension?: JsonValue
  idempotencyKey?: string
}

export interface SendMessageResult {
  ref: MessageRef
  sentAt: number
}

export type ChannelEvent =
  | { type: 'status.changed'; sequence: number; occurredAt: number; status: ChannelStatus }
  | { type: 'sync.started' | 'sync.finished'; sequence: number; occurredAt: number }
  | { type: 'sync.failed'; sequence: number; occurredAt: number; errorCode: string }
  | { type: 'channel.upserted'; sequence: number; occurredAt: number; channels: Channel[] }
  | { type: 'channel.deleted'; sequence: number; occurredAt: number; channelRefs: ChannelRef[] }
  | { type: 'channel.totalUnreadChanged'; sequence: number; occurredAt: number; total: number }
  | { type: 'message.upserted'; sequence: number; occurredAt: number; messages: Message[] }
  | { type: 'message.deleted'; sequence: number; occurredAt: number; refs: MessageRef[] }
  | { type: 'message.revoked'; sequence: number; occurredAt: number; refs: MessageRef[] }
  | {
      type: 'message.historyCleared'
      sequence: number
      occurredAt: number
      channelRef: ChannelRef
      before?: number
    }
  | {
      type: 'message.pinChanged'
      sequence: number
      occurredAt: number
      ref: MessageRef
      pinned: boolean
    }
  | {
      type: 'message.reactionsChanged'
      sequence: number
      occurredAt: number
      ref: MessageRef
      reactions: MessageReaction[]
    }
  | {
      type: 'message.receiptChanged'
      sequence: number
      occurredAt: number
      ref: MessageRef
      receipt: MessageReceipt
    }

export type ChannelEventPayload = ChannelEvent extends infer Event
  ? Event extends ChannelEvent
    ? Omit<Event, 'sequence' | 'occurredAt'>
    : never
  : never

export type ChannelEventListener = (event: ChannelEvent) => void

export interface ChannelTransport extends ChannelUserProfileClient {
  descriptor(): ChannelTransportDescriptor
  capabilities(): ChannelCapability[]
  connect(): Promise<void>
  disconnect(): Promise<void>
  status(): ChannelStatus
  getSelfProfile(): Promise<ChannelSelfProfile>
  listChannels(request: ListChannelsRequest): Promise<ChannelPage>
  loadMessages(request: LoadMessagesRequest): Promise<MessagePage>
  sendMessage(request: SendMessageRequest): Promise<SendMessageResult>
  openDirectConversation(accountId: string): Promise<ChannelRef>
  markRead(channelRef: ChannelRef): Promise<void>
  subscribe(listener: ChannelEventListener): () => void
  dispose(): Promise<void>
}

export class ChannelTransportError extends Error {
  constructor(
    readonly code:
      | 'invalidRequest'
      | 'notInitialized'
      | 'notConnected'
      | 'unsupportedCapability'
      | 'authentication'
      | 'transport'
      | 'protocolFailure'
      | 'timeout'
      | 'disposed',
    readonly retryable: boolean,
  ) {
    super(code)
    this.name = 'ChannelTransportError'
  }
}
