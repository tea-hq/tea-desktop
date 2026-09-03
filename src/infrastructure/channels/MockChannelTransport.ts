import type {
  Channel,
  ChannelCapability,
  ChannelEvent,
  ChannelEventListener,
  ChannelEventPayload,
  ChannelPage,
  ChannelRef,
  ChannelSelfProfile,
  ChannelUserProfile,
  ChannelStatus,
  ChannelTransport,
  ChannelTransportDescriptor,
  ListChannelsRequest,
  LoadMessagesRequest,
  Message,
  MessagePage,
  MessageRef,
  SendMessageRequest,
  SendMessageResult,
} from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'
import { deriveChannelAccountRef } from './accountScope'

const now = Date.now()
const minute = 60_000

const participants = {
  meng: { id: 'meng', name: '孟凡', isCurrentUser: false },
  lin: { id: 'lin', name: '林晓', isCurrentUser: false },
  yu: { id: 'yu', name: '余舟', isCurrentUser: false },
  chen: { id: 'chen', name: '陈嘉', isCurrentUser: false },
  me: { id: 'me', name: '我', isCurrentUser: true },
}

const seedChannels: Channel[] = [
  {
    ref: 'product-collab',
    kind: 'group',
    name: '产品协作',
    avatarUrl:
      'https://yx-web-nosdn.netease.im/common/2425b4cc058e5788867d63c322feb7ac/groupAvatar1.png',
    description: 'Tea 产品与研发协作',
    memberCount: 12,
    unreadCount: 4,
    updatedAt: now,
  },
  {
    ref: 'runtime-architecture',
    kind: 'group',
    name: 'Runtime 架构',
    avatarUrl:
      'https://yx-web-nosdn.netease.im/common/62c45692c9771ab388d43fea1c9d2758/groupAvatar2.png',
    description: 'Runtime contracts and adapters',
    memberCount: 7,
    unreadCount: 0,
    updatedAt: now - minute * 60,
  },
  {
    ref: 'lin-direct',
    kind: 'direct',
    name: '林晓',
    participantAccountId: 'lin',
    description: '产品设计',
    unreadCount: 1,
    updatedAt: now - minute * 120,
  },
  {
    ref: 'tea-release',
    kind: 'group',
    name: 'Tea Release',
    avatarUrl:
      'https://yx-web-nosdn.netease.im/common/d1ed3c21d3f87a41568d17197760e663/groupAvatar3.png',
    description: '版本发布与质量跟踪',
    memberCount: 18,
    unreadCount: 0,
    updatedAt: now - minute * 180,
  },
]

const seedMessages: Message[] = [
  createSeedMessage(
    'm-101',
    participants.meng,
    now - minute * 24,
    '我们现在从群里讨论需求，到整理成文档，再进入评审，中间的信息损耗还是很明显。尤其是讨论里的反例和限制条件，最后经常没进文档。',
  ),
  createSeedMessage(
    'm-102',
    participants.lin,
    now - minute * 19,
    '我更希望 Agent 能看到当前讨论，但不要在群里不断发过程消息。结果出来以后，先让我确认，再决定是回群还是生成文档。',
  ),
  createSeedMessage(
    'm-103',
    participants.yu,
    now - minute * 11,
    '同意。入口可以直接放在消息操作里，以某条消息作为锚点，让 Agent 自己向前扩展上下文。这样也不用额外 @ 一个机器人。',
  ),
  createSeedMessage(
    'm-104',
    participants.me,
    now - minute * 6,
    '第一期先做人工触发和人工确认回写。通道能力与 Agent runtime 之间需要独立桥接，后续能替换通道，也能增加新的 Agent。',
  ),
  createSeedMessage(
    'm-105',
    participants.chen,
    now,
    '那评审时最好能看见 Agent 实际引用了哪些消息。不是展示推理过程，而是让结论能回到来源。',
  ),
]

const capabilities: ChannelCapability[] = [
  'channel.list',
  'profile.self',
  'message.history',
  'message.send.text',
  'channel.read',
  'message.modify.events',
  'message.delete.events',
  'message.revoke.events',
  'message.pin.events',
  'message.receipt.events',
].map((id) => ({ id: id as ChannelCapability['id'], available: true }))
capabilities.push({ id: 'message.quickComment', available: false, reason: 'notVerified' })

export class MockChannelTransport implements ChannelTransport {
  private currentStatus: ChannelStatus = { phase: 'disconnected', retryable: false }
  private listeners = new Set<ChannelEventListener>()
  private channels = structuredClone(seedChannels)
  private messages = new Map<ChannelRef, Message[]>([
    ['product-collab', structuredClone(seedMessages)],
  ])
  private sentByKey = new Map<string, SendMessageResult>()
  private sequence = 0
  private disposed = false

  descriptor(): ChannelTransportDescriptor {
    return {
      id: 'mock.channel',
      displayName: 'Browser preview',
      protocolVersion: 1,
      capabilities: this.capabilities(),
    }
  }

  capabilities(): ChannelCapability[] {
    return structuredClone(capabilities)
  }

  async connect(): Promise<void> {
    this.assertUsable()
    const accountRef = await deriveChannelAccountRef(
      this.descriptor().id,
      'browser-preview',
      'preview',
    )
    this.setStatus({ phase: 'connecting', account: 'preview', accountRef, retryable: false })
    this.setStatus({ phase: 'connected', account: 'preview', accountRef, retryable: false })
  }

  async disconnect(): Promise<void> {
    if (this.disposed) return
    this.resetMemory()
    this.setStatus({ phase: 'disconnected', retryable: false })
  }

  status(): ChannelStatus {
    return structuredClone(this.currentStatus)
  }

  async getSelfProfile(): Promise<ChannelSelfProfile> {
    const profiles = await this.getUserProfiles(['preview'])
    return profiles[0]!
  }

  async getUserProfiles(accountIds: string[]): Promise<ChannelUserProfile[]> {
    this.assertConnected()
    const known: Record<string, ChannelUserProfile> = {
      preview: { accountId: 'preview', name: 'Tea Preview', email: 'preview@example.test' },
      meng: { accountId: 'meng', name: '孟凡' },
      lin: { accountId: 'lin', name: '林晓' },
      yu: { accountId: 'yu', name: '余舟' },
      chen: { accountId: 'chen', name: '陈嘉' },
      me: { accountId: 'me', name: '我' },
    }
    return accountIds
      .map((accountId) => known[accountId.trim()])
      .filter((profile): profile is ChannelUserProfile => Boolean(profile))
      .map((profile) => structuredClone(profile))
  }

  async listChannels(request: ListChannelsRequest): Promise<ChannelPage> {
    this.assertConnected()
    const limit = boundedLimit(request.limit, 100)
    const offset = Math.max(0, request.offset)
    const items = this.channels.slice(offset, offset + limit)
    return {
      items: structuredClone(items),
      nextOffset: offset + items.length,
      hasMore: offset + items.length < this.channels.length,
    }
  }

  async loadMessages(request: LoadMessagesRequest): Promise<MessagePage> {
    this.assertConnected()
    const limit = boundedLimit(request.limit, 100)
    const values = this.messages.get(request.channelRef) ?? []
    const anchorIndex = request.anchorMessage
      ? values.findIndex((message) => sameMessageRef(message.ref, request.anchorMessage!))
      : request.direction === 'before'
        ? values.length
        : -1
    if (request.anchorMessage && anchorIndex < 0)
      throw new ChannelTransportError('invalidRequest', false)

    const candidates =
      request.direction === 'before' ? values.slice(0, anchorIndex) : values.slice(anchorIndex + 1)
    const items =
      request.direction === 'before'
        ? candidates.slice(Math.max(0, candidates.length - limit))
        : candidates.slice(0, limit)
    const next = request.direction === 'before' ? items[0] : items[items.length - 1]
    return {
      channelRef: request.channelRef,
      items: structuredClone(items),
      hasMore: candidates.length > items.length,
      nextAnchor: next ? structuredClone(next.ref) : undefined,
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    this.assertConnected()
    const text = request.text.trim()
    if (!text || text.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    if (request.idempotencyKey) {
      const existing = this.sentByKey.get(request.idempotencyKey)
      if (existing) return structuredClone(existing)
    }
    const clientId = `mock-${this.sequence + 1}-${Date.now()}`
    const result = {
      ref: {
        channelRef: request.channelRef,
        messageClientId: clientId,
        messageServerId: `server-${clientId}`,
      },
      sentAt: Date.now(),
    }
    const value: Message = {
      ref: result.ref,
      sender: participants.me,
      sentAt: result.sentAt,
      text,
      state: 'active',
      sentByCurrentUser: true,
      serverExtension: request.serverExtension,
      pinned: false,
      reactions: [],
    }
    const messages = this.messages.get(request.channelRef) ?? []
    messages.push(value)
    this.messages.set(request.channelRef, messages)
    if (request.idempotencyKey) this.sentByKey.set(request.idempotencyKey, result)
    this.emit({ type: 'message.upserted', messages: [structuredClone(value)] })
    return structuredClone(result)
  }

  async openDirectConversation(accountId: string): Promise<ChannelRef> {
    if (!accountId.trim()) throw new ChannelTransportError('invalidRequest', false)
    return `direct-${accountId.trim()}`
  }

  async markRead(channelRef: ChannelRef): Promise<void> {
    this.assertConnected()
    const channel = this.channels.find((candidate) => candidate.ref === channelRef)
    if (!channel) throw new ChannelTransportError('invalidRequest', false)
    channel.unreadCount = 0
    channel.lastReadAt = Date.now()
    this.emit({ type: 'channel.upserted', channels: [structuredClone(channel)] })
  }

  subscribe(listener: ChannelEventListener): () => void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.resetMemory()
    this.listeners.clear()
    this.currentStatus = { phase: 'disconnected', retryable: false }
    this.disposed = true
  }

  emitForTest(event: ChannelEventPayload): void {
    this.emit(event)
  }

  private emit(event: ChannelEventPayload): void {
    const envelope = { ...event, sequence: ++this.sequence, occurredAt: Date.now() } as ChannelEvent
    for (const listener of [...this.listeners]) listener(structuredClone(envelope))
  }

  private setStatus(status: ChannelStatus): void {
    this.currentStatus = status
    this.emit({ type: 'status.changed', status: structuredClone(status) })
  }

  private resetMemory(): void {
    this.channels = structuredClone(seedChannels)
    this.messages = new Map([['product-collab', structuredClone(seedMessages)]])
    this.sentByKey.clear()
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
  }

  private assertConnected(): void {
    this.assertUsable()
    if (this.currentStatus.phase !== 'connected')
      throw new ChannelTransportError('notConnected', true)
  }
}

function createSeedMessage(
  messageClientId: string,
  sender: Message['sender'],
  sentAt: number,
  text: string,
): Message {
  return {
    ref: {
      channelRef: 'product-collab',
      messageClientId,
      messageServerId: `server-${messageClientId}`,
    },
    sender,
    sentAt,
    text,
    state: 'active',
    sentByCurrentUser: sender.isCurrentUser,
    pinned: false,
    reactions: [],
  }
}

function boundedLimit(limit: number, maximum: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum)
    throw new ChannelTransportError('invalidRequest', false)
  return limit
}

function sameMessageRef(left: MessageRef, right: MessageRef): boolean {
  if (left.channelRef !== right.channelRef) return false
  return (
    left.messageClientId === right.messageClientId ||
    Boolean(
      left.messageServerId &&
      right.messageServerId &&
      left.messageServerId === right.messageServerId,
    )
  )
}
