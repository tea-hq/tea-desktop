import type {
  Channel,
  ChannelCapability,
  ChannelDetails,
  ChannelMember,
  ChannelMemberPage,
  CreateGroupRequest,
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
  DeleteMessagesRequest,
  ListSavedMessagesRequest,
  ListChannelsRequest,
  LoadMessagesRequest,
  ListChannelMembersRequest,
  Message,
  MessagePage,
  MessageReceiptDetails,
  MessageSearchPage,
  MessageRef,
  UpdateGroupRequest,
  GroupMembersRequest,
  GroupMemberRoleRequest,
  GroupMemberMuteRequest,
  ModifyMessageRequest,
  PinMessageRequest,
  PinnedMessage,
  SavedMessage,
  SavedMessagePage,
  SaveMessageRequest,
  QuickCommentRequest,
  ReplyMessageRequest,
  ForwardMessageRequest,
  ForwardMessageResult,
  RevokeMessageRequest,
  SendMessageRequest,
  SendMessageResult,
  SearchMessagesRequest,
} from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'
import {
  createTextMessageContent,
  messageContentToText,
  outgoingContentToMessageContent,
} from '@/features/channels/messageContent'
import {
  FORWARD_TARGET_LIMIT,
  forwardMessageEligibility,
} from '@/features/channels/messageForwarding'
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
    pinned: true,
    muted: false,
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
    pinned: false,
    muted: false,
    unreadCount: 0,
    updatedAt: now - minute * 60,
  },
  {
    ref: 'lin-direct',
    kind: 'direct',
    directAccountId: 'lin',
    name: '林晓',
    participantAccountId: 'lin',
    description: '产品设计',
    pinned: false,
    muted: true,
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
    pinned: false,
    muted: false,
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
  {
    ...createSeedMessage(
      'm-104',
      participants.me,
      now - minute * 6,
      '第一期先做人工触发和人工确认回写。通道能力与 Agent runtime 之间需要独立桥接，后续能替换通道，也能增加新的 Agent。',
    ),
    receipt: { readCount: 3, unreadCount: 2 },
  },
  createSeedMessage(
    'm-105',
    participants.chen,
    now,
    '那评审时最好能看见 Agent 实际引用了哪些消息。不是展示推理过程，而是让结论能回到来源。',
  ),
]

const capabilities: ChannelCapability[] = [
  'channel.list',
  'channel.details',
  'channel.members',
  'channel.manage',
  'channel.pin',
  'channel.mute',
  'channel.hide',
  'presence.subscribe',
  'profile.self',
  'message.history',
  'message.search',
  'message.send.text',
  'message.send.media',
  'message.reply',
  'message.forward',
  'message.modify',
  'message.delete',
  'message.revoke',
  'message.pin',
  'message.pin.list',
  'message.save',
  'message.save.list',
  'message.quickComment',
  'channel.read',
  'message.modify.events',
  'message.delete.events',
  'message.revoke.events',
  'message.pin.events',
  'message.receipt.events',
  'message.receipt.details',
].map((id) => ({ id: id as ChannelCapability['id'], available: true }))

export class MockChannelTransport implements ChannelTransport {
  private currentStatus: ChannelStatus = { phase: 'disconnected', retryable: false }
  private listeners = new Set<ChannelEventListener>()
  private channels = structuredClone(seedChannels)
  private messages = new Map<ChannelRef, Message[]>([
    ['product-collab', structuredClone(seedMessages)],
  ])
  private sentByKey = new Map<string, SendMessageResult>()
  private forwardedByKey = new Map<string, ForwardMessageResult>()
  private savedMessages: SavedMessage[] = []
  private mergedArchives = new Map<string, Message[]>()
  private sequence = 0
  private disposed = false
  private presenceAccountIds = new Set<string>()

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

  async getChannelDetails(channelRef: ChannelRef): Promise<ChannelDetails> {
    this.assertConnected()
    const channel = this.channels.find((value) => value.ref === channelRef)
    if (!channel) throw new ChannelTransportError('invalidRequest', false)
    return {
      channelRef,
      name: channel.name,
      description: channel.description,
      announcement:
        channel.kind === 'group' ? 'Keep decisions and owners visible in the thread.' : undefined,
      ownerAccountId: channel.kind === 'group' ? 'me' : undefined,
      memberCount: channel.memberCount ?? 2,
      memberLimit: channel.kind === 'group' ? 200 : undefined,
      chatBanned: false,
    }
  }

  async listChannelMembers(request: ListChannelMembersRequest): Promise<ChannelMemberPage> {
    this.assertConnected()
    const channel = this.channels.find((value) => value.ref === request.channelRef)
    if (
      !channel ||
      channel.kind !== 'group' ||
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100
    )
      throw new ChannelTransportError('invalidRequest', false)
    const members: ChannelMember[] = [
      {
        accountId: 'me',
        name: '我',
        role: 'owner',
        joinedAt: now - minute * 500,
        chatBanned: false,
      },
      {
        accountId: 'meng',
        name: '孟凡',
        role: 'manager',
        joinedAt: now - minute * 400,
        chatBanned: false,
      },
      {
        accountId: 'lin',
        name: '林晓',
        role: 'member',
        joinedAt: now - minute * 300,
        chatBanned: false,
      },
      {
        accountId: 'yu',
        name: '余舟',
        role: 'member',
        joinedAt: now - minute * 200,
        chatBanned: false,
      },
    ]
    const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0
    if (!Number.isInteger(offset) || offset < 0)
      throw new ChannelTransportError('invalidRequest', false)
    const items = members.slice(offset, offset + request.limit)
    const nextOffset = offset + items.length
    return {
      channelRef: request.channelRef,
      items: structuredClone(items),
      hasMore: nextOffset < members.length,
      ...(nextOffset < members.length ? { nextCursor: String(nextOffset) } : {}),
    }
  }

  async createGroup(request: CreateGroupRequest): Promise<Channel> {
    this.assertConnected()
    const name = request.name.trim()
    const members = uniqueAccounts(request.memberAccountIds)
    if (!name || name.length > 200 || members.length > 99)
      throw new ChannelTransportError('invalidRequest', false)
    const ref = `mock-team-${this.sequence + 1}`
    const channel: Channel = {
      ref,
      kind: 'group',
      name,
      description: request.description?.trim().slice(0, 1_024) ?? '',
      memberCount: members.length + 1,
      pinned: false,
      muted: false,
      unreadCount: 0,
      updatedAt: Date.now(),
    }
    this.channels.unshift(channel)
    this.messages.set(ref, [])
    this.emit({ type: 'channel.upserted', channels: [structuredClone(channel)] })
    return structuredClone(channel)
  }

  async updateGroup(request: UpdateGroupRequest): Promise<void> {
    this.assertConnected()
    const channel = this.channels.find((value) => value.ref === request.channelRef)
    if (!channel || channel.kind !== 'group')
      throw new ChannelTransportError('invalidRequest', false)
    if (request.name !== undefined) {
      const name = request.name.trim()
      if (!name || name.length > 200) throw new ChannelTransportError('invalidRequest', false)
      channel.name = name
    }
    if (request.description !== undefined)
      channel.description = request.description.trim().slice(0, 1_024)
    channel.updatedAt = Date.now()
    this.emit({ type: 'channel.upserted', channels: [structuredClone(channel)] })
  }

  async inviteGroupMembers(request: GroupMembersRequest): Promise<{ failedAccountIds: string[] }> {
    this.assertGroupRequest(request)
    return { failedAccountIds: [] }
  }

  async removeGroupMembers(request: GroupMembersRequest): Promise<void> {
    this.assertGroupRequest(request)
  }

  async leaveGroup(channelRef: ChannelRef): Promise<void> {
    await this.removeGroup(channelRef)
  }

  async dismissGroup(channelRef: ChannelRef): Promise<void> {
    await this.removeGroup(channelRef)
  }

  async setGroupMemberRole(request: GroupMemberRoleRequest): Promise<void> {
    this.assertGroupRequest(request)
  }

  async setGroupMemberMute(request: GroupMemberMuteRequest): Promise<void> {
    this.assertConnected()
    if (!request.accountId.trim()) throw new ChannelTransportError('invalidRequest', false)
    const channel = this.channels.find((value) => value.ref === request.channelRef)
    if (!channel || channel.kind !== 'group')
      throw new ChannelTransportError('invalidRequest', false)
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

  async searchMessages(request: SearchMessagesRequest): Promise<MessageSearchPage> {
    this.assertConnected()
    const keyword = request.keyword.trim().toLocaleLowerCase()
    if (!keyword || keyword.length > 512 || keyword.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    const limit = boundedLimit(request.limit, 100)
    const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0
    if (!Number.isInteger(offset) || offset < 0 || (request.cursor && request.cursor.length > 512))
      throw new ChannelTransportError('invalidRequest', false)
    if (request.channelRef && !this.channels.some((channel) => channel.ref === request.channelRef))
      throw new ChannelTransportError('invalidRequest', false)

    const matches = [...this.messages.entries()]
      .filter(([channelRef]) => !request.channelRef || channelRef === request.channelRef)
      .flatMap(([, messages]) => messages)
      .filter(
        (message) =>
          message.state === 'active' && message.text.toLocaleLowerCase().includes(keyword),
      )
      .sort((left, right) => {
        const result = right.sentAt - left.sentAt
        return request.direction === 'oldest'
          ? -result || left.ref.messageClientId.localeCompare(right.ref.messageClientId)
          : result || right.ref.messageClientId.localeCompare(left.ref.messageClientId)
      })
    const items = matches.slice(offset, offset + limit)
    const nextOffset = offset + items.length
    return {
      items: structuredClone(items),
      totalCount: matches.length,
      hasMore: nextOffset < matches.length,
      ...(nextOffset < matches.length ? { nextCursor: String(nextOffset) } : {}),
    }
  }

  async listPinnedMessages(channelRef: ChannelRef): Promise<PinnedMessage[]> {
    this.assertConnected()
    if (!this.channels.some((channel) => channel.ref === channelRef))
      throw new ChannelTransportError('invalidRequest', false)
    return structuredClone(
      (this.messages.get(channelRef) ?? [])
        .filter((message) => message.pinned && message.state === 'active')
        .map((message) => ({ message, pinnedByAccountId: 'me', pinnedAt: message.sentAt }))
        .sort((left, right) => right.pinnedAt - left.pinnedAt),
    )
  }

  async saveMessage(request: SaveMessageRequest): Promise<SavedMessage> {
    this.assertConnected()
    const message = this.findMessage(request.messageRef)
    if (!message || message.state !== 'active')
      throw new ChannelTransportError('invalidRequest', false)
    const identity = message.ref.messageServerId || message.ref.messageClientId
    const existing = this.savedMessages.find(
      (value) =>
        value.message.ref.channelRef === message.ref.channelRef &&
        (value.message.ref.messageServerId || value.message.ref.messageClientId) === identity,
    )
    const value: SavedMessage = {
      id: existing?.id ?? `mock-saved-${identity}`,
      message: structuredClone(message),
      savedAt: Date.now(),
      ...(request.sourceChannelName ? { sourceChannelName: request.sourceChannelName.trim() } : {}),
    }
    this.savedMessages = [
      value,
      ...this.savedMessages.filter((candidate) => candidate.id !== value.id),
    ]
    return structuredClone(value)
  }

  async listSavedMessages(request: ListSavedMessagesRequest): Promise<SavedMessagePage> {
    this.assertConnected()
    const limit = boundedLimit(request.limit, 100)
    const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0
    if (!Number.isInteger(offset) || offset < 0 || (request.cursor && request.cursor.length > 512))
      throw new ChannelTransportError('invalidRequest', false)
    const items = this.savedMessages.slice(offset, offset + limit)
    const nextOffset = offset + items.length
    return {
      items: structuredClone(items),
      totalCount: this.savedMessages.length,
      hasMore: nextOffset < this.savedMessages.length,
      ...(nextOffset < this.savedMessages.length ? { nextCursor: String(nextOffset) } : {}),
    }
  }

  async removeSavedMessage(savedMessageId: string): Promise<void> {
    this.assertConnected()
    const id = savedMessageId.trim()
    if (!id || id.length > 512 || id.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    const next = this.savedMessages.filter((value) => value.id !== id)
    if (next.length === this.savedMessages.length)
      throw new ChannelTransportError('invalidRequest', false)
    this.savedMessages = next
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    this.assertConnected()
    const content = outgoingContentToMessageContent(request.content)
    const text = messageContentToText(content).trim()
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
      content,
      state: 'active',
      sentByCurrentUser: true,
      serverExtension: request.serverExtension,
      clientReference: request.idempotencyKey,
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

  async replyMessage(request: ReplyMessageRequest): Promise<SendMessageResult> {
    this.assertConnected()
    const original = this.findMessage(request.replyTo)
    if (!original || original.ref.channelRef !== request.channelRef)
      throw new ChannelTransportError('invalidRequest', false)
    const content = outgoingContentToMessageContent(request.content)
    const text = messageContentToText(content).trim()
    if (!text || text.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    if (request.idempotencyKey) {
      const existing = this.sentByKey.get(request.idempotencyKey)
      if (existing) return structuredClone(existing)
    }
    const result = this.createSentResult(request.channelRef)
    const value: Message = {
      ref: result.ref,
      sender: participants.me,
      sentAt: result.sentAt,
      text,
      content,
      replyTo: {
        ref: structuredClone(original.ref),
        senderName: original.sender.name,
        text: original.text,
      },
      state: 'active',
      sentByCurrentUser: true,
      serverExtension: request.serverExtension,
      clientReference: request.idempotencyKey,
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

  async cancelMessageSend(_operationId: string): Promise<void> {
    this.assertUsable()
  }

  async forwardMessage(request: ForwardMessageRequest): Promise<ForwardMessageResult> {
    this.assertConnected()
    const sourceMessages = request.messageRefs.map((ref) => this.findMessage(ref))
    const targets = [...new Set(request.targetChannelRefs.map((ref) => ref.trim()).filter(Boolean))]
    const sourceChannels = new Set(request.messageRefs.map((ref) => ref.channelRef))
    if (
      sourceMessages.some((message) => !message) ||
      sourceChannels.size !== 1 ||
      !targets.length ||
      targets.length > FORWARD_TARGET_LIMIT
    )
      throw new ChannelTransportError('invalidRequest', false)
    const values = sourceMessages as Message[]
    const eligibility = forwardMessageEligibility(values, request.mode)
    if (!eligibility.eligible)
      throw new ChannelTransportError(
        eligibility.reason === 'unsupportedContent' ? 'unsupportedCapability' : 'invalidRequest',
        false,
      )
    const comment = request.comment?.trim()
    if (comment && comment.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    if (request.idempotencyKey) {
      const existing = this.forwardedByKey.get(request.idempotencyKey)
      if (existing) return structuredClone(existing)
    }
    const ordered = [...values].sort(
      (left, right) =>
        left.sentAt - right.sentAt ||
        left.ref.messageClientId.localeCompare(right.ref.messageClientId),
    )
    const results: SendMessageResult[] = []
    for (const channelRef of targets) {
      if (!this.channels.some((channel) => channel.ref === channelRef))
        throw new ChannelTransportError('invalidRequest', false)
      if (request.mode === 'individual') {
        for (const original of ordered) {
          const result = this.createSentResult(channelRef)
          const value: Message = {
            ...structuredClone(original),
            ref: result.ref,
            sentAt: result.sentAt,
            sender: participants.me,
            sentByCurrentUser: true,
            replyTo: undefined,
          }
          this.appendMessage(channelRef, value)
          results.push(result)
        }
      } else {
        const result = this.createSentResult(channelRef)
        const content: Message['content'] = {
          kind: 'merged',
          sourceChannelName:
            request.sourceChannelName?.trim() || request.messageRefs[0]!.channelRef,
          abstracts: ordered.slice(0, 3).map((message) => ({
            senderAccountId: message.sender.id,
            senderName: message.sender.name,
            text: message.content.kind === 'merged' ? '[Chat history]' : message.text,
          })),
          depth: eligibility.depth!,
        }
        const value: Message = {
          ref: result.ref,
          sender: participants.me,
          sentAt: result.sentAt,
          text: messageContentToText(content),
          content,
          state: 'active',
          sentByCurrentUser: true,
          pinned: false,
          reactions: [],
        }
        this.mergedArchives.set(messageIdentity(result.ref), structuredClone(ordered))
        this.appendMessage(channelRef, value)
        results.push(result)
      }
      if (comment) {
        const result = await this.sendMessage({
          channelRef,
          content: createTextMessageContent(comment),
        })
        results.push(result)
      }
    }
    const forwarded = { messages: results }
    if (request.idempotencyKey)
      this.forwardedByKey.set(request.idempotencyKey, structuredClone(forwarded))
    return forwarded
  }

  async loadMergedMessages(messageRef: MessageRef): Promise<Message[]> {
    this.assertConnected()
    const message = this.findMessage(messageRef)
    const archive = this.mergedArchives.get(messageIdentity(messageRef))
    if (!message || message.content.kind !== 'merged' || !archive)
      throw new ChannelTransportError('invalidRequest', false)
    return structuredClone(archive)
  }

  async modifyMessage(request: ModifyMessageRequest): Promise<void> {
    this.assertConnected()
    const message = this.findMessage(request.messageRef)
    if (!message || !message.sentByCurrentUser)
      throw new ChannelTransportError('invalidRequest', false)
    const text = request.text.trim()
    if (!text || text.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    message.text = text
    message.content = createTextMessageContent(text)
    if (request.serverExtension !== undefined) message.serverExtension = request.serverExtension
    this.emit({ type: 'message.upserted', messages: [structuredClone(message)] })
  }

  async deleteMessages(request: DeleteMessagesRequest): Promise<void> {
    this.assertConnected()
    if (!request.messageRefs.length || request.messageRefs.length > 50)
      throw new ChannelTransportError('invalidRequest', false)
    const deleted = request.messageRefs.filter((ref) => Boolean(this.findMessage(ref)))
    for (const ref of deleted) {
      const messages = this.messages.get(ref.channelRef) ?? []
      this.messages.set(
        ref.channelRef,
        messages.filter((message) => !sameMessageRef(message.ref, ref)),
      )
    }
    if (deleted.length) this.emit({ type: 'message.deleted', refs: structuredClone(deleted) })
  }

  async revokeMessage(request: RevokeMessageRequest): Promise<void> {
    this.assertConnected()
    const message = this.findMessage(request.messageRef)
    if (!message || !message.sentByCurrentUser)
      throw new ChannelTransportError('invalidRequest', false)
    message.state = 'revoked'
    message.text = ''
    message.content = { kind: 'redacted', reason: 'revoked' }
    this.emit({ type: 'message.revoked', refs: [structuredClone(message.ref)] })
  }

  async pinMessage(request: PinMessageRequest): Promise<void> {
    this.assertConnected()
    const message = this.findMessage(request.messageRef)
    if (!message) throw new ChannelTransportError('invalidRequest', false)
    message.pinned = request.pinned
    this.emit({
      type: 'message.pinChanged',
      ref: structuredClone(message.ref),
      pinned: request.pinned,
    })
  }

  async quickComment(request: QuickCommentRequest): Promise<void> {
    this.assertConnected()
    if (!Number.isInteger(request.type) || request.type < 0)
      throw new ChannelTransportError('invalidRequest', false)
    const message = this.findMessage(request.messageRef)
    if (!message) throw new ChannelTransportError('invalidRequest', false)
    const reactions = message.reactions.filter((reaction) => reaction.type !== request.type)
    if (request.active) reactions.push({ type: request.type, count: 1, active: true })
    message.reactions = reactions
    this.emit({
      type: 'message.reactionsChanged',
      ref: structuredClone(message.ref),
      reactions: structuredClone(reactions),
    })
  }

  async getMessageReceiptDetails(messageRef: MessageRef): Promise<MessageReceiptDetails> {
    this.assertConnected()
    const message = this.messages
      .get(messageRef.channelRef)
      ?.find((value) => sameMessageRef(value.ref, messageRef))
    const channel = this.channels.find((value) => value.ref === messageRef.channelRef)
    if (!message || !message.sentByCurrentUser || channel?.kind !== 'group')
      throw new ChannelTransportError('invalidRequest', false)
    return {
      messageRef: structuredClone(messageRef),
      read: [participants.meng, participants.lin].map((value) => structuredClone(value)),
      unread: [participants.yu, participants.chen].map((value) => structuredClone(value)),
      readCount: 2,
      unreadCount: 2,
    }
  }

  async openDirectConversation(accountId: string): Promise<ChannelRef> {
    if (!accountId.trim()) throw new ChannelTransportError('invalidRequest', false)
    return `direct-${accountId.trim()}`
  }

  async setChannelPinned(channelRef: ChannelRef, pinned: boolean): Promise<void> {
    this.assertConnected()
    const channel = this.channels.find((candidate) => candidate.ref === channelRef)
    if (!channel || typeof pinned !== 'boolean')
      throw new ChannelTransportError('invalidRequest', false)
    channel.pinned = pinned
    this.emit({ type: 'channel.upserted', channels: [structuredClone(channel)] })
  }

  async setChannelMuted(channelRef: ChannelRef, muted: boolean): Promise<void> {
    this.assertConnected()
    const channel = this.channels.find((candidate) => candidate.ref === channelRef)
    if (!channel || typeof muted !== 'boolean')
      throw new ChannelTransportError('invalidRequest', false)
    channel.muted = muted
    this.emit({ type: 'channel.upserted', channels: [structuredClone(channel)] })
  }

  async hideChannel(channelRef: ChannelRef): Promise<void> {
    this.assertConnected()
    const index = this.channels.findIndex((candidate) => candidate.ref === channelRef)
    if (index < 0) throw new ChannelTransportError('invalidRequest', false)
    this.channels.splice(index, 1)
    this.messages.delete(channelRef)
    this.emit({ type: 'channel.deleted', channelRefs: [channelRef] })
  }

  async markRead(channelRef: ChannelRef): Promise<void> {
    this.assertConnected()
    const channel = this.channels.find((candidate) => candidate.ref === channelRef)
    if (!channel) throw new ChannelTransportError('invalidRequest', false)
    channel.unreadCount = 0
    channel.lastReadAt = Date.now()
    this.emit({ type: 'channel.upserted', channels: [structuredClone(channel)] })
  }

  async setPresenceSubscriptions(accountIds: string[]): Promise<void> {
    this.assertConnected()
    const normalized = normalizeMockPresenceAccounts(accountIds)
    this.presenceAccountIds = new Set(normalized)
    if (normalized.length) {
      this.emit({
        type: 'presence.changed',
        presences: normalized.map((accountId) => ({
          accountId,
          availability: accountId === 'lin' ? 'online' : 'offline',
          updatedAt: now,
        })),
      })
    }
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
    this.forwardedByKey.clear()
    this.savedMessages = []
    this.mergedArchives.clear()
    this.presenceAccountIds.clear()
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
  }

  private assertConnected(): void {
    this.assertUsable()
    if (this.currentStatus.phase !== 'connected')
      throw new ChannelTransportError('notConnected', true)
  }

  private findMessage(ref: MessageRef): Message | undefined {
    return (
      (this.messages.get(ref.channelRef) ?? []).find((message) =>
        sameMessageRef(message.ref, ref),
      ) ?? this.savedMessages.find((item) => sameMessageRef(item.message.ref, ref))?.message
    )
  }

  private appendMessage(channelRef: ChannelRef, message: Message): void {
    const messages = this.messages.get(channelRef) ?? []
    messages.push(message)
    this.messages.set(channelRef, messages)
    this.emit({ type: 'message.upserted', messages: [structuredClone(message)] })
  }

  private createSentResult(channelRef: ChannelRef): SendMessageResult {
    const clientId = `mock-${this.sequence + 1}-${Date.now()}`
    return {
      ref: {
        channelRef,
        messageClientId: clientId,
        messageServerId: `server-${clientId}`,
      },
      sentAt: Date.now(),
    }
  }

  private assertGroupRequest(request: GroupMembersRequest): void {
    this.assertConnected()
    const channel = this.channels.find((value) => value.ref === request.channelRef)
    const accountIds = uniqueAccounts(request.accountIds)
    if (!channel || channel.kind !== 'group' || !accountIds.length || accountIds.length > 100)
      throw new ChannelTransportError('invalidRequest', false)
  }

  private async removeGroup(channelRef: ChannelRef): Promise<void> {
    this.assertConnected()
    const index = this.channels.findIndex(
      (value) => value.ref === channelRef && value.kind === 'group',
    )
    if (index < 0) throw new ChannelTransportError('invalidRequest', false)
    this.channels.splice(index, 1)
    this.messages.delete(channelRef)
    this.emit({ type: 'channel.deleted', channelRefs: [channelRef] })
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
    content: createTextMessageContent(text),
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

function messageIdentity(ref: MessageRef): string {
  return `${ref.channelRef}\u0000${ref.messageServerId || ref.messageClientId}`
}

function uniqueAccounts(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeMockPresenceAccounts(values: string[]): string[] {
  if (!Array.isArray(values)) throw new ChannelTransportError('invalidRequest', false)
  const result = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') throw new ChannelTransportError('invalidRequest', false)
    const accountId = value.trim()
    if (!accountId || accountId.length > 512 || /[\u0000-\u001f\u007f]/.test(accountId))
      throw new ChannelTransportError('invalidRequest', false)
    result.add(accountId)
    if (result.size > 3_000) throw new ChannelTransportError('limitExceeded', false)
  }
  return [...result]
}
