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
  directAccountId?: string
  name: string
  avatarUrl?: string
  description: string
  memberCount?: number
  pinned: boolean
  muted: boolean
  unreadCount: number
  updatedAt: number
  lastMessagePreview?: string
  lastReadAt?: number
}

export type ChannelPresenceAvailability = 'online' | 'offline' | 'unknown'

export interface ChannelPresence {
  accountId: string
  availability: ChannelPresenceAvailability
  updatedAt: number
}

export type MessageState = 'active' | 'revoked'

export interface MessageReceipt {
  readCount?: number
  unreadCount?: number
  readAt?: number
}

export interface MessageMentionRange {
  start: number
  end: number
}

export type MessageMentionTarget = { kind: 'user'; accountId: string } | { kind: 'channel' }

/**
 * Provider-neutral mention metadata. Ranges use JavaScript string offsets so
 * adapters can translate them without exposing provider extension fields.
 */
export interface MessageMention {
  target: MessageMentionTarget
  label: string
  ranges: MessageMentionRange[]
}

/** A human-authored IM composer draft, independent from Agent delivery drafts. */
export interface ChannelDraft {
  accountRef: string
  channelRef: ChannelRef
  text: string
  mentions: MessageMention[]
  updatedAt: number
}

export interface SaveChannelDraftRequest {
  accountRef: string
  channelRef: ChannelRef
  text: string
  mentions: MessageMention[]
}

export interface ChannelDraftClient {
  list(accountRef: string): Promise<ChannelDraft[]>
  save(request: SaveChannelDraftRequest): Promise<ChannelDraft>
  remove(accountRef: string, channelRef: ChannelRef): Promise<void>
}

export interface MessageReceiptDetails {
  messageRef: MessageRef
  read: Participant[]
  unread: Participant[]
  readCount: number
  unreadCount: number
}

/** Provider-neutral projection of a message-rooted Channel discussion. */
export interface ChannelThread {
  channelRef: ChannelRef
  root: Message
  replies: Message[]
  replyCount: number
  updatedAt: number
}

export interface MessageReaction {
  type: number
  count: number
  active: boolean
}

export type ChannelVoiceTranscriptionStatus = 'loading' | 'ready' | 'failed'

/** Account-lifecycle projection of a user-requested voice transcription. */
export interface ChannelVoiceTranscript {
  messageRef: MessageRef
  status: ChannelVoiceTranscriptionStatus
  text?: string
  errorCode?: string
  retryable: boolean
}

export const CHANNEL_VOICE_PLAYBACK_RATES = [1, 1.5, 2] as const

export type ChannelVoicePlaybackRate = (typeof CHANNEL_VOICE_PLAYBACK_RATES)[number]
export type ChannelVoicePlaybackStatus = 'loading' | 'playing' | 'paused' | 'failed'
export type ChannelVoicePlaybackErrorCode =
  'blocked' | 'network' | 'decode' | 'unsupported' | 'unknown'

export interface ChannelVoicePlaybackState {
  messageRef: MessageRef
  status: ChannelVoicePlaybackStatus
  positionMs: number
  durationMs: number
  playbackRate: ChannelVoicePlaybackRate
  errorCode?: ChannelVoicePlaybackErrorCode
  retryable: boolean
}

export interface ChannelVoicePlaybackRequest {
  messageRef: MessageRef
  sourceUrl: string
  durationMs?: number
  startAtMs: number
  playbackRate: ChannelVoicePlaybackRate
}

export type ChannelVoicePlaybackEvent =
  | { type: 'playing' | 'paused' | 'ended' }
  | { type: 'progress'; positionMs: number; durationMs: number }
  | { type: 'failed'; errorCode: ChannelVoicePlaybackErrorCode; retryable: boolean }

export type ChannelVoicePlaybackListener = (event: ChannelVoicePlaybackEvent) => void

/** Renderer platform boundary for one mutually exclusive voice media element. */
export interface ChannelVoicePlaybackClient {
  play(request: ChannelVoicePlaybackRequest, listener: ChannelVoicePlaybackListener): Promise<void>
  pause(): void
  seek(positionMs: number): void
  setPlaybackRate(rate: ChannelVoicePlaybackRate): void
  stop(): void
  dispose(): void
}

export class ChannelVoicePlaybackClientError extends Error {
  constructor(
    readonly code: ChannelVoicePlaybackErrorCode,
    readonly retryable: boolean,
  ) {
    super(code)
    this.name = 'ChannelVoicePlaybackClientError'
  }
}

export type ChannelMediaSaveErrorCode =
  | 'invalidRequest'
  | 'messageUnavailable'
  | 'mediaUnavailable'
  | 'unsupportedProtocol'
  | 'tooLarge'
  | 'downloadFailed'
  | 'writeFailed'
  | 'unknown'

export interface ChannelMediaSaveRequest {
  operationId: string
  messageRef: MessageRef
}

export type ChannelMediaSaveResult =
  { status: 'saved'; fileName: string; byteLength: number } | { status: 'cancelled' }

export interface ChannelMediaSaveProgressEvent {
  operationId: string
  phase: 'saving'
  receivedBytes: number
  totalBytes?: number
}

export type ChannelMediaSaveProgressListener = (event: ChannelMediaSaveProgressEvent) => void

export type ChannelMediaSaveStatus = 'choosing' | 'saving' | 'saved' | 'failed' | 'cancelled'

/** Account-lifecycle projection of an explicit user save operation. */
export interface ChannelMediaSaveState {
  operationId: string
  messageRef: MessageRef
  status: ChannelMediaSaveStatus
  receivedBytes: number
  totalBytes?: number
  fileName?: string
  byteLength?: number
  errorCode?: ChannelMediaSaveErrorCode
  retryable: boolean
}

/** Renderer-to-platform boundary for user-initiated media saving. */
export interface ChannelMediaClient {
  save(
    request: ChannelMediaSaveRequest,
    listener: ChannelMediaSaveProgressListener,
  ): Promise<ChannelMediaSaveResult>
  cancel(operationId: string): Promise<void>
  dispose(): Promise<void>
}

export class ChannelMediaClientError extends Error {
  constructor(
    readonly code: ChannelMediaSaveErrorCode,
    readonly retryable: boolean,
  ) {
    super(code)
    this.name = 'ChannelMediaClientError'
  }
}

/**
 * Provider-neutral media metadata. Local File/Blob handles deliberately do
 * not cross this boundary; upload orchestration belongs to a transport.
 */
export interface MessageMediaAttachment {
  url?: string
  name?: string
  size?: number
  extension?: string
  mimeType?: string
  width?: number
  height?: number
  durationMs?: number
}

export interface MessageCallDuration {
  accountId: string
  durationMs: number
}

export interface MergedMessageAbstract {
  senderAccountId: string
  senderName: string
  text: string
}

/**
 * An attachment handle is issued by the platform/transport boundary. The
 * renderer never passes a File, Blob, or provider object through this port.
 */
export interface MessageAttachmentSource {
  kind: 'localFile'
  token: string
}

export type MessageMediaKind = 'image' | 'audio' | 'video' | 'file'

/**
 * A platform-issued attachment reference. The token is opaque to the
 * renderer and expires when the platform-side picker scope is disposed.
 */
export interface ChannelAttachment {
  token: string
  name: string
  mimeType?: string
  size?: number
  extension?: string
  kind: MessageMediaKind
}

export interface ChannelAttachmentPicker {
  pick(): Promise<ChannelAttachment[]>
  release(token: string): Promise<void>
}

/**
 * Tea Center-backed people directory used to validate IM recipients before a
 * provider operation is attempted.
 */
export interface ChannelContactDirectory {
  isKnownContact(accountId: string): Promise<boolean>
}

export interface OutgoingMessageMedia {
  source: MessageAttachmentSource
  name?: string
  mimeType?: string
  width?: number
  height?: number
  durationMs?: number
}

export type OutgoingMessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; caption?: string; media: OutgoingMessageMedia }
  | { kind: 'audio'; caption?: string; media: OutgoingMessageMedia }
  | { kind: 'video'; caption?: string; media: OutgoingMessageMedia }
  | { kind: 'file'; caption?: string; media: OutgoingMessageMedia }
  | { kind: 'location'; latitude: number; longitude: number; address: string }
  | { kind: 'custom'; subtype: number; text: string; raw?: string; data?: JsonValue }
  | {
      kind: 'call'
      callType: number
      channelId: string
      status: number
      durations: MessageCallDuration[]
      text: string
    }
  | { kind: 'tips'; text: string }

export type MessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; caption?: string; media: MessageMediaAttachment }
  | { kind: 'audio'; caption?: string; media: MessageMediaAttachment }
  | { kind: 'video'; caption?: string; media: MessageMediaAttachment }
  | { kind: 'file'; caption?: string; media: MessageMediaAttachment }
  | { kind: 'location'; latitude: number; longitude: number; address: string }
  | {
      kind: 'notification'
      notificationType: number
      targetIds: string[]
      chatBanned?: boolean
      data?: JsonValue
    }
  | {
      kind: 'call'
      callType: number
      channelId: string
      status: number
      durations: MessageCallDuration[]
      text: string
    }
  | {
      kind: 'merged'
      sourceChannelName?: string
      abstracts: MergedMessageAbstract[]
      depth: number
    }
  | { kind: 'custom'; subtype: number; text: string; raw?: string; data?: JsonValue }
  | { kind: 'robot'; text: string; data?: JsonValue }
  | { kind: 'tips'; text: string }
  | { kind: 'avchat'; text?: string }
  | { kind: 'unknown'; providerType: number; subtype?: number; text?: string }
  | { kind: 'redacted'; reason: 'revoked' }

export interface Message {
  ref: MessageRef
  sender: Participant
  sentAt: number
  /** Display projection retained for existing timeline/search surfaces. */
  text: string
  content: MessageContent
  replyTo?: MessageReply
  state: MessageState
  sentByCurrentUser: boolean
  serverExtension?: JsonValue
  pinned: boolean
  reactions: MessageReaction[]
  receipt?: MessageReceipt
  mentions?: MessageMention[]
  /** Tea-owned send correlation, independent from provider message ids. */
  clientReference?: string
}

export interface MessageReply {
  ref: MessageRef
  senderName: string
  text: string
}

export type OutgoingMessageStatus = 'sending' | 'failed' | 'cancelled'

/**
 * Ephemeral renderer projection for content that has not been confirmed as a
 * provider Message. Retry reuses idempotencyKey and replaces operationId.
 */
export interface OutgoingMessageAttempt {
  attemptId: string
  idempotencyKey: string
  operationId: string
  channelRef: ChannelRef
  content: OutgoingMessageContent
  mentions: MessageMention[]
  replyTo?: MessageReply
  createdAt: number
  status: OutgoingMessageStatus
  progress: number
  attemptNumber: number
  retryable: boolean
  errorCode?: string
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

/**
 * Provider-neutral cloud message search. A missing channelRef searches all
 * conversations visible to the signed-in account.
 */
export interface SearchMessagesRequest {
  keyword: string
  channelRef?: ChannelRef
  limit: number
  cursor?: string
  direction?: 'newest' | 'oldest'
}

export interface MessageSearchPage {
  items: Message[]
  totalCount: number
  hasMore: boolean
  nextCursor?: string
}

export interface MessageSearchState {
  query: string
  channelRef: ChannelRef | null
  items: Message[]
  totalCount: number
  hasMore: boolean
  nextCursor?: string
  loading: boolean
  errorCode: string | null
}

export interface PinnedMessage {
  message: Message
  pinnedByAccountId?: string
  pinnedAt: number
}

export interface SavedMessage {
  id: string
  message: Message
  savedAt: number
  sourceChannelName?: string
}

export interface ListSavedMessagesRequest {
  limit: number
  cursor?: string
}

export interface SavedMessagePage {
  items: SavedMessage[]
  totalCount: number
  hasMore: boolean
  nextCursor?: string
}

export interface SaveMessageRequest {
  messageRef: MessageRef
  sourceChannelName?: string
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
  | 'channel.details'
  | 'channel.members'
  | 'channel.manage'
  | 'channel.pin'
  | 'channel.mute'
  | 'channel.hide'
  | 'presence.subscribe'
  | 'profile.self'
  | 'message.history'
  | 'message.search'
  | 'message.send.text'
  | 'message.send.media'
  | 'message.reply'
  | 'message.forward'
  | 'message.modify'
  | 'message.delete'
  | 'message.revoke'
  | 'message.pin'
  | 'message.pin.list'
  | 'message.save'
  | 'message.save.list'
  | 'message.quickComment'
  | 'message.voice.transcribe'
  | 'channel.read'
  | 'message.modify.events'
  | 'message.delete.events'
  | 'message.revoke.events'
  | 'message.pin.events'
  | 'message.receipt.events'
  | 'message.receipt.details'
  | 'message.thread'

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
  sign?: string
  email?: string
  avatarUrl?: string
}

export type ChannelSelfProfile = ChannelUserProfile

export interface ChannelUserProfileClient {
  getUserProfiles(accountIds: string[]): Promise<ChannelUserProfile[]>
}

export type ChannelMemberRole = 'owner' | 'manager' | 'member'

export interface ChannelMember {
  accountId: string
  name: string
  avatarUrl?: string
  role: ChannelMemberRole
  joinedAt?: number
  chatBanned: boolean
}

export interface ChannelDetails {
  channelRef: ChannelRef
  name: string
  description: string
  announcement?: string
  ownerAccountId?: string
  memberCount: number
  memberLimit?: number
  chatBanned: boolean
}

export interface ChannelNotificationContext {
  channelRef: ChannelRef
  channelName: string
  muted: boolean
}

export interface ChannelNotificationSourceResolver {
  resolveNotificationContext(channelRef: ChannelRef): Promise<ChannelNotificationContext>
}

export type ChannelNotificationActivationListener = (messageRef: MessageRef) => void

/** Renderer platform boundary for activating a message from a desktop notification. */
export interface ChannelNotificationActivationClient {
  subscribe(listener: ChannelNotificationActivationListener): () => void
  dispose(): Promise<void>
}

export interface ListChannelMembersRequest {
  channelRef: ChannelRef
  limit: number
  cursor?: string
}

export interface ChannelMemberPage {
  channelRef: ChannelRef
  items: ChannelMember[]
  hasMore: boolean
  nextCursor?: string
}

export interface CreateGroupRequest {
  name: string
  memberAccountIds: string[]
  description?: string
  announcement?: string
  memberLimit?: number
}

export interface UpdateGroupRequest {
  channelRef: ChannelRef
  name?: string
  description?: string
  announcement?: string
  chatBanned?: boolean
}

export interface GroupMembersRequest {
  channelRef: ChannelRef
  accountIds: string[]
}

export interface GroupMemberRoleRequest extends GroupMembersRequest {
  role: Exclude<ChannelMemberRole, 'owner'>
}

export interface GroupMemberMuteRequest {
  channelRef: ChannelRef
  accountId: string
  chatBanned: boolean
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
  content: OutgoingMessageContent
  mentions?: MessageMention[]
  serverExtension?: JsonValue
  idempotencyKey?: string
  operationId?: string
}

export interface SendMessageResult {
  ref: MessageRef
  sentAt: number
}

export interface ReplyMessageRequest {
  channelRef: ChannelRef
  replyTo: MessageRef
  content: OutgoingMessageContent
  mentions?: MessageMention[]
  serverExtension?: JsonValue
  idempotencyKey?: string
  operationId?: string
}

export type ForwardMessageMode = 'individual' | 'merged'

export interface ForwardMessageRequest {
  messageRefs: MessageRef[]
  targetChannelRefs: ChannelRef[]
  mode: ForwardMessageMode
  sourceChannelName?: string
  comment?: string
  idempotencyKey?: string
}

export interface ForwardMessageResult {
  messages: SendMessageResult[]
}

export interface ModifyMessageRequest {
  messageRef: MessageRef
  text: string
  serverExtension?: JsonValue
}

export interface DeleteMessagesRequest {
  messageRefs: MessageRef[]
}

export interface RevokeMessageRequest {
  messageRef: MessageRef
  postscript?: string
}

export interface PinMessageRequest {
  messageRef: MessageRef
  pinned: boolean
}

export interface QuickCommentRequest {
  messageRef: MessageRef
  type: number
  active: boolean
}

export type ChannelEvent =
  | { type: 'status.changed'; sequence: number; occurredAt: number; status: ChannelStatus }
  | { type: 'sync.started' | 'sync.finished'; sequence: number; occurredAt: number }
  | { type: 'sync.failed'; sequence: number; occurredAt: number; errorCode: string }
  | { type: 'channel.upserted'; sequence: number; occurredAt: number; channels: Channel[] }
  | { type: 'channel.deleted'; sequence: number; occurredAt: number; channelRefs: ChannelRef[] }
  | { type: 'channel.totalUnreadChanged'; sequence: number; occurredAt: number; total: number }
  | { type: 'message.received'; sequence: number; occurredAt: number; messages: Message[] }
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
  | {
      type: 'message.sendProgress'
      sequence: number
      occurredAt: number
      operationId: string
      progress: number
    }
  | {
      type: 'presence.changed'
      sequence: number
      occurredAt: number
      presences: ChannelPresence[]
    }
  | {
      type: 'presence.subscriptionFailed'
      sequence: number
      occurredAt: number
      errorCode: string
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
  getChannelDetails(channelRef: ChannelRef): Promise<ChannelDetails>
  listChannelMembers(request: ListChannelMembersRequest): Promise<ChannelMemberPage>
  createGroup(request: CreateGroupRequest): Promise<Channel>
  updateGroup(request: UpdateGroupRequest): Promise<void>
  inviteGroupMembers(request: GroupMembersRequest): Promise<{ failedAccountIds: string[] }>
  removeGroupMembers(request: GroupMembersRequest): Promise<void>
  leaveGroup(channelRef: ChannelRef): Promise<void>
  dismissGroup(channelRef: ChannelRef): Promise<void>
  setGroupMemberRole(request: GroupMemberRoleRequest): Promise<void>
  setGroupMemberMute(request: GroupMemberMuteRequest): Promise<void>
  loadMessages(request: LoadMessagesRequest): Promise<MessagePage>
  searchMessages(request: SearchMessagesRequest): Promise<MessageSearchPage>
  listPinnedMessages(channelRef: ChannelRef): Promise<PinnedMessage[]>
  saveMessage(request: SaveMessageRequest): Promise<SavedMessage>
  listSavedMessages(request: ListSavedMessagesRequest): Promise<SavedMessagePage>
  removeSavedMessage(savedMessageId: string): Promise<void>
  sendMessage(request: SendMessageRequest): Promise<SendMessageResult>
  replyMessage(request: ReplyMessageRequest): Promise<SendMessageResult>
  cancelMessageSend(operationId: string): Promise<void>
  forwardMessage(request: ForwardMessageRequest): Promise<ForwardMessageResult>
  loadMergedMessages(messageRef: MessageRef): Promise<Message[]>
  modifyMessage(request: ModifyMessageRequest): Promise<void>
  deleteMessages(request: DeleteMessagesRequest): Promise<void>
  revokeMessage(request: RevokeMessageRequest): Promise<void>
  pinMessage(request: PinMessageRequest): Promise<void>
  quickComment(request: QuickCommentRequest): Promise<void>
  transcribeVoice(messageRef: MessageRef): Promise<string>
  getMessageReceiptDetails(messageRef: MessageRef): Promise<MessageReceiptDetails>
  loadThread(messageRef: MessageRef): Promise<ChannelThread>
  openDirectConversation(accountId: string): Promise<ChannelRef>
  setChannelPinned(channelRef: ChannelRef, pinned: boolean): Promise<void>
  setChannelMuted(channelRef: ChannelRef, muted: boolean): Promise<void>
  hideChannel(channelRef: ChannelRef): Promise<void>
  markRead(channelRef: ChannelRef): Promise<void>
  setPresenceSubscriptions(accountIds: string[]): Promise<void>
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
      | 'limitExceeded'
      | 'timeout'
      | 'disposed',
    readonly retryable: boolean,
  ) {
    super(code)
    this.name = 'ChannelTransportError'
  }
}
