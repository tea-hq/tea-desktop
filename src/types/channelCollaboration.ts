export type ChannelRef = string

export interface MessageRef {
  channelRef: ChannelRef
  messageClientId: string
  messageServerId?: string
}

export interface ChannelBinding {
  transportId: string
  accountRef: string
  channelRef: ChannelRef
}

export type ConversationScopeFilter =
  | { kind: 'all' }
  | { kind: 'local' }
  | { kind: 'channel' }
  | { kind: 'binding'; binding: ChannelBinding }

export type ChannelSourceOrigin = 'userForwarded' | 'agentTool'
export type ChannelSourceState = 'active' | 'modified' | 'revoked' | 'deleted'

export interface ChannelSourceInput {
  messageRef: MessageRef
  senderName: string
  sentAt: number
  sentByCurrentUser: boolean
  text: string
  capturedAt: number
  state: ChannelSourceState
}

export interface ChannelSource extends ChannelSourceInput {
  sourceId: string
  conversationId: string
  turnIndex: number
  origin: ChannelSourceOrigin
  latestText?: string
  lastObservedAt?: number
}

export interface ConversationTurnContext {
  turnIndex: number
  visibleText: string
  createdAt: number
  sources: ChannelSource[]
}

export interface Draft {
  draftId: string
  conversationId: string
  sourceTurnIndex: number
  sourceBlockId: string
  currentVersion: number
  content: string
  createdAt: number
  updatedAt: number
}

export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface Delivery {
  deliveryId: string
  draftId: string
  draftVersion: number
  channelBinding: ChannelBinding
  idempotencyKey: string
  status: DeliveryStatus
  sentMessageRef?: MessageRef
  failureCode?: string
  createdAt: number
  updatedAt: number
}

export interface CollaborationSnapshot {
  turnContexts: ConversationTurnContext[]
  drafts: Draft[]
  deliveries: Delivery[]
}
