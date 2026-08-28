import type {
  ChannelCapability,
  ChannelEvent,
  ChannelEventListener,
  ChannelEventPayload,
  ChannelPage,
  ChannelRef,
  ChannelSelfProfile,
  ChannelStatus,
  ChannelTransport,
  ChannelTransportDescriptor,
  ListChannelsRequest,
  LoadMessagesRequest,
  MessagePage,
  MessageReaction,
  MessageRef,
  SendMessageRequest,
  SendMessageResult,
} from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'
import type { V2NIM as BrowserSdkInstance } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK'
import type { V2NIMConversation } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMConversationService'
import type {
  V2NIMClearHistoryNotification,
  V2NIMMessage,
  V2NIMMessageDeletedNotification,
  V2NIMMessagePinNotification,
  V2NIMMessageQuickCommentNotification,
  V2NIMMessageRevokeNotification,
  V2NIMP2PMessageReadReceipt,
  V2NIMTeamMessageReadReceipt,
} from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'
import type { V2NIMError } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/types'
import {
  mapYunxinConversation,
  mapYunxinMessage,
  mapYunxinMessageRef,
  mapYunxinRefer,
  serializeServerExtension,
} from './yunxinMapper'
import { deriveChannelAccountRef } from './accountScope'
import type {
  ManagedImCredentialClient,
  ManagedImCredentials,
} from './electronManagedImCredentials'

export interface YunxinSdkFactory {
  create(appKey: string): YunxinSdk | Promise<YunxinSdk>
}

export type YunxinSdk = BrowserSdkInstance & { destroy(): Promise<void> }
type YunxinSdkConstructor = {
  getInstance(
    options: Record<string, unknown>,
    otherOptions: Record<string, unknown>,
  ): BrowserSdkInstance
}

const defaultFactory: YunxinSdkFactory = {
  create: async (appKey) => {
    const BrowserSdk = resolveYunxinSdkModule(
      await import('nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK'),
    )
    return BrowserSdk.getInstance(
      {
        appkey: appKey,
        needReconnect: true,
        apiVersion: 'v2',
        debugLevel: 'off',
        enableV2CloudConversation: true,
      },
      {
        V2NIMLoginServiceConfig: {
          lbsUrls: ['https://lbs.netease.im/lbs/webconf.jsp'],
          linkUrl: 'weblink.netease.im',
        },
      },
    ) as YunxinSdk
  },
}

export function resolveYunxinSdkModule(module: unknown): YunxinSdkConstructor {
  let candidate = module
  for (let depth = 0; depth < 3; depth += 1) {
    if (isModuleRecord(candidate) && typeof candidate.getInstance === 'function') {
      return candidate as YunxinSdkConstructor
    }
    candidate = isModuleRecord(candidate) ? candidate.default : undefined
  }
  throw new TypeError('Yunxin SDK module does not expose getInstance')
}

function isModuleRecord(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

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

export class YunxinWebChannelTransport implements ChannelTransport {
  private sdk: YunxinSdk | null = null
  private currentStatus: ChannelStatus = { phase: 'disconnected', retryable: false }
  private listeners = new Set<ChannelEventListener>()
  private rawMessages = new Map<string, V2NIMMessage>()
  private reactions = new Map<string, Map<number, Set<string>>>()
  private sentByKey = new Map<string, SendMessageResult>()
  private sequence = 0
  private listenersAttached = false
  private disposed = false
  private sdkAppKey: string | null = null
  private selfAccount: string | null = null
  private credentialFingerprint: string | null = null
  private lifecycleGeneration = 0

  constructor(
    private readonly credentials: ManagedImCredentialClient,
    private readonly factory: YunxinSdkFactory = defaultFactory,
  ) {}

  descriptor(): ChannelTransportDescriptor {
    return {
      id: 'yunxin.web',
      displayName: 'Yunxin',
      protocolVersion: 1,
      capabilities: this.capabilities(),
    }
  }

  capabilities(): ChannelCapability[] {
    return structuredClone(capabilities)
  }

  async connect(): Promise<void> {
    this.assertUsable()
    const generation = ++this.lifecycleGeneration
    let credentials: ManagedImCredentials
    try {
      credentials = await this.credentials.load()
    } catch {
      this.assertCurrent(generation)
      this.setStatus({
        phase: 'failed',
        errorCode: 'managedCredentialsUnavailable',
        retryable: false,
      })
      throw new ChannelTransportError('notInitialized', false)
    }
    this.assertCurrent(generation)
    if (!validManagedCredentials(credentials))
      throw new ChannelTransportError('invalidRequest', false)
    const accountRef = await deriveChannelAccountRef(
      this.descriptor().id,
      credentials.appKey,
      credentials.account,
    )
    const fingerprint = await credentialDigest(credentials)
    this.assertCurrent(generation)
    if (this.currentStatus.phase === 'connected' && this.credentialFingerprint === fingerprint)
      return
    if (this.currentStatus.phase !== 'disconnected') {
      await this.disconnectSdk()
      this.assertCurrent(generation)
    }
    if (this.sdk && this.sdkAppKey !== credentials.appKey) {
      this.detachListeners()
      const staleSdk = this.sdk
      this.sdk = null
      this.sdkAppKey = null
      await staleSdk.destroy()
      this.assertCurrent(generation)
    }
    this.selfAccount = credentials.account
    this.setStatus({ phase: 'connecting', accountRef, retryable: false })
    try {
      if (!this.sdk) {
        const sdk = await this.factory.create(credentials.appKey)
        if (!this.isCurrent(generation)) {
          await sdk.destroy()
          this.assertCurrent(generation)
        }
        this.sdk = sdk
        this.sdkAppKey = credentials.appKey
      }
      this.attachListeners()
    } catch {
      this.assertCurrent(generation)
      this.setStatus({
        phase: 'failed',
        accountRef,
        errorCode: 'sdkInitialization',
        retryable: false,
      })
      throw new ChannelTransportError('transport', false)
    }
    try {
      await this.sdk.V2NIMLoginService.login(credentials.account, credentials.token)
      this.assertCurrent(generation)
      this.credentialFingerprint = fingerprint
      this.setStatus({ phase: 'connected', accountRef, retryable: false })
    } catch (error) {
      this.assertCurrent(generation)
      const code = errorCode(error)
      this.setStatus({ phase: 'failed', accountRef, errorCode: code, retryable: false })
      throw new ChannelTransportError('authentication', false)
    }
  }

  async disconnect(): Promise<void> {
    if (this.disposed) return
    this.lifecycleGeneration += 1
    await this.disconnectSdk()
  }

  private async disconnectSdk(): Promise<void> {
    if (this.sdk) {
      this.detachListeners()
      try {
        await this.sdk.V2NIMLoginService.logout()
      } catch {
        /* state is cleared regardless */
      }
    }
    this.resetMemory()
    this.selfAccount = null
    this.credentialFingerprint = null
    this.setStatus({ phase: 'disconnected', retryable: false })
  }

  status(): ChannelStatus {
    return structuredClone(this.currentStatus)
  }

  async getSelfProfile(): Promise<ChannelSelfProfile> {
    const sdk = this.connectedSdk()
    const expectedAccount = this.selfAccount
    if (!expectedAccount) throw new ChannelTransportError('protocolFailure', false)
    let profiles: unknown
    try {
      profiles = await sdk.V2NIMUserService.getUserListFromCloud([expectedAccount])
    } catch {
      throw new ChannelTransportError('transport', true)
    }
    if (!Array.isArray(profiles) || profiles.length !== 1) {
      throw new ChannelTransportError('protocolFailure', false)
    }
    return mapSelfProfile(profiles[0], expectedAccount)
  }

  async listChannels(request: ListChannelsRequest): Promise<ChannelPage> {
    const sdk = this.connectedSdk()
    const limit = validateLimit(request.limit)
    const result = await sdk.V2NIMConversationService.getConversationList(
      Math.max(0, request.offset),
      limit,
    )
    return {
      items: result.conversationList
        .map((value) => this.mapConversation(value))
        .filter((value) => value !== null),
      nextOffset: result.offset,
      hasMore: !result.finished,
    }
  }

  async loadMessages(request: LoadMessagesRequest): Promise<MessagePage> {
    const sdk = this.connectedSdk()
    const limit = validateLimit(request.limit)
    const anchorMessage = request.anchorMessage
      ? this.rawMessages.get(messageKey(request.anchorMessage))
      : undefined
    if (request.anchorMessage && !anchorMessage)
      throw new ChannelTransportError('invalidRequest', false)
    const result = await sdk.V2NIMMessageService.getMessageListEx({
      conversationId: request.channelRef,
      limit,
      anchorMessage,
      direction: request.direction === 'before' ? 0 : 1,
      messageTypes: [0],
    })
    const values = result.messages
    values.forEach((value) => this.rememberMessage(value))
    if (result.anchorMessage) this.rememberMessage(result.anchorMessage)
    const items = values
      .map((value) => mapYunxinMessage(value, this.selfAccount ?? ''))
      .filter((value) => value !== null)
    items.sort(
      (left, right) =>
        left.sentAt - right.sentAt ||
        left.ref.messageClientId.localeCompare(right.ref.messageClientId),
    )
    return {
      channelRef: request.channelRef,
      items,
      hasMore: result.hasMore,
      nextAnchor: result.anchorMessage ? mapYunxinMessageRef(result.anchorMessage) : undefined,
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    const sdk = this.connectedSdk()
    const text = request.text.trim()
    if (!text || text.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    if (request.idempotencyKey) {
      const existing = this.sentByKey.get(request.idempotencyKey)
      if (existing) return structuredClone(existing)
    }
    const message = sdk.V2NIMMessageCreator.createTextMessage(text)
    message.serverExtension = serializeServerExtension(request.serverExtension)
    const result = await sdk.V2NIMMessageService.sendMessage(message, request.channelRef, {
      messageConfig: { readReceiptEnabled: true },
    })
    this.rememberMessage(result.message)
    this.emitMessages([result.message])
    const sendResult = {
      ref: mapYunxinMessageRef(result.message),
      sentAt: result.message.createTime,
    }
    if (request.idempotencyKey) this.sentByKey.set(request.idempotencyKey, sendResult)
    return sendResult
  }

  async openDirectConversation(accountId: string): Promise<ChannelRef> {
    const sdk = this.connectedSdk()
    const target = accountId.trim()
    if (!target || target === this.selfAccount)
      throw new ChannelTransportError('invalidRequest', false)
    const channelRef = sdk.V2NIMConversationIdUtil.p2pConversationId(target)
    await sdk.V2NIMConversationService.createConversation(channelRef)
    return channelRef
  }

  async markRead(channelRef: ChannelRef): Promise<void> {
    await this.connectedSdk().V2NIMConversationService.markConversationRead(channelRef)
  }

  subscribe(listener: ChannelEventListener): () => void {
    this.assertUsable()
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.lifecycleGeneration += 1
    this.disposed = true
    this.detachListeners()
    const sdk = this.sdk
    this.sdk = null
    this.sdkAppKey = null
    this.selfAccount = null
    this.credentialFingerprint = null
    this.resetMemory()
    this.listeners.clear()
    this.currentStatus = { phase: 'disconnected', retryable: false }
    if (sdk) {
      try {
        await sdk.destroy()
      } catch {
        /* local disposal remains authoritative */
      }
    }
  }

  private readonly onLoginStatus = (status: number) => {
    if (status === 0 && this.currentStatus.phase !== 'kickedOffline')
      this.setStatus({ phase: 'disconnected', retryable: false })
  }
  private readonly onLoginFailed = (error: V2NIMError) =>
    this.setStatus({ phase: 'failed', errorCode: errorCode(error), retryable: false })
  private readonly onKickedOffline = () => {
    this.resetMemory()
    this.setStatus({ phase: 'kickedOffline', retryable: false })
  }
  private readonly onConnectStatus = (status: number) => {
    if (status === 1) this.setStatus({ phase: 'connected', retryable: false })
    else if (status === 2) this.setStatus({ phase: 'connecting', retryable: true })
    else if (status === 3) this.setStatus({ phase: 'reconnecting', retryable: true })
    else if (this.currentStatus.phase !== 'kickedOffline')
      this.setStatus({ phase: 'disconnected', retryable: true })
  }
  private readonly onDisconnected = (error: V2NIMError) =>
    this.setStatus({ phase: 'reconnecting', errorCode: errorCode(error), retryable: true })
  private readonly onConnectFailed = (error: V2NIMError) =>
    this.setStatus({ phase: 'failed', errorCode: errorCode(error), retryable: true })
  private readonly onDataSync = (_type: number, state: number, error?: V2NIMError) => {
    if (error) this.emit({ type: 'sync.failed', errorCode: errorCode(error) })
    else if (state === 1 || state === 2) this.emit({ type: 'sync.started' })
    else if (state === 3) this.emit({ type: 'sync.finished' })
  }
  private readonly onSyncStarted = () => this.emit({ type: 'sync.started' })
  private readonly onSyncFinished = () => this.emit({ type: 'sync.finished' })
  private readonly onSyncFailed = (error: V2NIMError) =>
    this.emit({ type: 'sync.failed', errorCode: errorCode(error) })
  private readonly onConversationCreated = (value: V2NIMConversation) => {
    if (value.type === 2 && (!value.name || !value.avatar)) {
      void this.refreshCreatedGroup(value)
      return
    }
    this.emitChannels([value])
  }
  private readonly onConversationDeleted = (channelRefs: string[]) =>
    this.emit({ type: 'channel.deleted', channelRefs })
  private readonly onConversationChanged = (values: V2NIMConversation[]) =>
    this.emitChannels(values)
  private readonly onTotalUnreadCountChanged = (total: number) =>
    this.emit({ type: 'channel.totalUnreadChanged', total })
  private readonly onReceiveMessages = (values: V2NIMMessage[]) => this.emitMessages(values)
  private readonly onReceiveMessagesModified = (values: V2NIMMessage[]) => this.emitMessages(values)
  private readonly onClearHistoryNotifications = (values: V2NIMClearHistoryNotification[]) =>
    values.forEach((value) =>
      this.emit({
        type: 'message.historyCleared',
        channelRef: value.conversationId,
        before: value.deleteTime,
      }),
    )
  private readonly onMessageDeletedNotifications = (values: V2NIMMessageDeletedNotification[]) =>
    this.emit({
      type: 'message.deleted',
      refs: values.map((value) => mapYunxinRefer(value.messageRefer)),
    })
  private readonly onMessageRevokeNotifications = (values: V2NIMMessageRevokeNotification[]) =>
    this.emit({
      type: 'message.revoked',
      refs: values.map((value) => mapYunxinRefer(value.messageRefer)),
    })
  private readonly onMessagePinNotification = (value: V2NIMMessagePinNotification) =>
    this.emit({
      type: 'message.pinChanged',
      ref: mapYunxinRefer(value.pin.messageRefer),
      pinned: value.pinState !== 0,
    })
  private readonly onMessageQuickCommentNotification = (
    value: V2NIMMessageQuickCommentNotification,
  ) => {
    const ref = mapYunxinRefer(value.quickComment.messageRefer)
    const key = messageKey(ref)
    const byType = this.reactions.get(key) ?? new Map<number, Set<string>>()
    const operators = byType.get(value.quickComment.index) ?? new Set<string>()
    if (value.operationType === 1) operators.add(value.quickComment.operatorId)
    else operators.delete(value.quickComment.operatorId)
    if (operators.size) byType.set(value.quickComment.index, operators)
    else byType.delete(value.quickComment.index)
    this.reactions.set(key, byType)
    const reactions: MessageReaction[] = [...byType].map(([type, ids]) => ({
      type,
      count: ids.size,
      active: ids.has(this.selfAccount ?? ''),
    }))
    this.emit({ type: 'message.reactionsChanged', ref, reactions })
  }
  private readonly onReceiveP2PMessageReadReceipts = (values: V2NIMP2PMessageReadReceipt[]) => {
    for (const value of values) {
      for (const raw of this.rawMessages.values()) {
        if (
          raw.conversationId === value.conversationId &&
          raw.isSelf &&
          raw.createTime <= value.timestamp
        ) {
          this.emit({
            type: 'message.receiptChanged',
            ref: mapYunxinMessageRef(raw),
            receipt: { readAt: value.timestamp },
          })
        }
      }
    }
  }
  private readonly onReceiveTeamMessageReadReceipts = (values: V2NIMTeamMessageReadReceipt[]) =>
    values.forEach((value) =>
      this.emit({
        type: 'message.receiptChanged',
        ref: {
          channelRef: value.conversationId,
          messageClientId: value.messageClientId,
          messageServerId: value.messageServerId,
        },
        receipt: { readCount: value.readCount, unreadCount: value.unreadCount },
      }),
    )

  private attachListeners(): void {
    if (!this.sdk || this.listenersAttached) return
    const login = this.sdk.V2NIMLoginService
    login.on('onLoginStatus', this.onLoginStatus)
    login.on('onLoginFailed', this.onLoginFailed)
    login.on('onKickedOffline', this.onKickedOffline)
    login.on('onConnectStatus', this.onConnectStatus)
    login.on('onDisconnected', this.onDisconnected)
    login.on('onConnectFailed', this.onConnectFailed)
    login.on('onDataSync', this.onDataSync)
    const conversation = this.sdk.V2NIMConversationService
    conversation.on('onSyncStarted', this.onSyncStarted)
    conversation.on('onSyncFinished', this.onSyncFinished)
    conversation.on('onSyncFailed', this.onSyncFailed)
    conversation.on('onConversationCreated', this.onConversationCreated)
    conversation.on('onConversationDeleted', this.onConversationDeleted)
    conversation.on('onConversationChanged', this.onConversationChanged)
    conversation.on('onTotalUnreadCountChanged', this.onTotalUnreadCountChanged)
    const message = this.sdk.V2NIMMessageService
    message.on('onReceiveMessages', this.onReceiveMessages)
    message.on('onReceiveMessagesModified', this.onReceiveMessagesModified)
    message.on('onClearHistoryNotifications', this.onClearHistoryNotifications)
    message.on('onMessageDeletedNotifications', this.onMessageDeletedNotifications)
    message.on('onMessageRevokeNotifications', this.onMessageRevokeNotifications)
    message.on('onMessagePinNotification', this.onMessagePinNotification)
    message.on('onMessageQuickCommentNotification', this.onMessageQuickCommentNotification)
    message.on('onReceiveP2PMessageReadReceipts', this.onReceiveP2PMessageReadReceipts)
    message.on('onReceiveTeamMessageReadReceipts', this.onReceiveTeamMessageReadReceipts)
    this.listenersAttached = true
  }

  private detachListeners(): void {
    if (!this.sdk || !this.listenersAttached) return
    const login = this.sdk.V2NIMLoginService
    login.off('onLoginStatus', this.onLoginStatus)
    login.off('onLoginFailed', this.onLoginFailed)
    login.off('onKickedOffline', this.onKickedOffline)
    login.off('onConnectStatus', this.onConnectStatus)
    login.off('onDisconnected', this.onDisconnected)
    login.off('onConnectFailed', this.onConnectFailed)
    login.off('onDataSync', this.onDataSync)
    const conversation = this.sdk.V2NIMConversationService
    conversation.off('onSyncStarted', this.onSyncStarted)
    conversation.off('onSyncFinished', this.onSyncFinished)
    conversation.off('onSyncFailed', this.onSyncFailed)
    conversation.off('onConversationCreated', this.onConversationCreated)
    conversation.off('onConversationDeleted', this.onConversationDeleted)
    conversation.off('onConversationChanged', this.onConversationChanged)
    conversation.off('onTotalUnreadCountChanged', this.onTotalUnreadCountChanged)
    const message = this.sdk.V2NIMMessageService
    message.off('onReceiveMessages', this.onReceiveMessages)
    message.off('onReceiveMessagesModified', this.onReceiveMessagesModified)
    message.off('onClearHistoryNotifications', this.onClearHistoryNotifications)
    message.off('onMessageDeletedNotifications', this.onMessageDeletedNotifications)
    message.off('onMessageRevokeNotifications', this.onMessageRevokeNotifications)
    message.off('onMessagePinNotification', this.onMessagePinNotification)
    message.off('onMessageQuickCommentNotification', this.onMessageQuickCommentNotification)
    message.off('onReceiveP2PMessageReadReceipts', this.onReceiveP2PMessageReadReceipts)
    message.off('onReceiveTeamMessageReadReceipts', this.onReceiveTeamMessageReadReceipts)
    this.listenersAttached = false
  }

  private emitChannels(values: V2NIMConversation[]): void {
    const channels = values
      .map((value) => this.mapConversation(value))
      .filter((value) => value !== null)
    if (channels.length) this.emit({ type: 'channel.upserted', channels })
  }

  private mapConversation(value: V2NIMConversation) {
    let targetId: string | undefined
    try {
      targetId = this.sdk?.V2NIMConversationIdUtil.parseConversationTargetId(value.conversationId)
    } catch {
      targetId = undefined
    }
    return mapYunxinConversation(value, targetId)
  }

  private async refreshCreatedGroup(fallback: V2NIMConversation): Promise<void> {
    const sdk = this.sdk
    if (!sdk) return
    try {
      const conversation = await sdk.V2NIMConversationService.getConversation(
        fallback.conversationId,
      )
      if (this.sdk === sdk && this.currentStatus.phase === 'connected')
        this.emitChannels([conversation])
    } catch {
      if (this.sdk === sdk && this.currentStatus.phase === 'connected')
        this.emitChannels([fallback])
    }
  }

  private emitMessages(values: V2NIMMessage[]): void {
    values.forEach((value) => this.rememberMessage(value))
    const messages = values
      .map((value) => mapYunxinMessage(value, this.selfAccount ?? ''))
      .filter((value) => value !== null)
    if (messages.length) this.emit({ type: 'message.upserted', messages })
  }

  private rememberMessage(value: V2NIMMessage): void {
    this.rawMessages.set(messageKey(mapYunxinMessageRef(value)), value)
  }

  private setStatus(status: ChannelStatus): void {
    const next =
      status.phase === 'disconnected'
        ? status
        : {
            ...status,
            accountRef: status.accountRef ?? this.currentStatus.accountRef,
          }
    this.currentStatus = next
    this.emit({ type: 'status.changed', status: structuredClone(next) })
  }

  private emit(event: ChannelEventPayload): void {
    const envelope = { ...event, sequence: ++this.sequence, occurredAt: Date.now() } as ChannelEvent
    for (const listener of [...this.listeners]) listener(structuredClone(envelope))
  }

  private connectedSdk(): YunxinSdk {
    this.assertUsable()
    if (!this.sdk || this.currentStatus.phase !== 'connected')
      throw new ChannelTransportError('notConnected', true)
    return this.sdk
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.lifecycleGeneration
  }

  private assertCurrent(generation: number): void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
    if (generation !== this.lifecycleGeneration) throw new ChannelTransportError('transport', true)
  }

  private resetMemory(): void {
    this.rawMessages.clear()
    this.reactions.clear()
    this.sentByKey.clear()
  }
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ChannelTransportError('invalidRequest', false)
  return limit
}

function validManagedCredentials(value: ManagedImCredentials): boolean {
  return (
    validCredentialPart(value.appKey, 256) &&
    validCredentialPart(value.account, 128) &&
    validCredentialPart(value.token, 4_096)
  )
}

function validCredentialPart(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !Array.from(value).some((character) => /[\u0000-\u001f\u007f]/.test(character))
  )
}

async function credentialDigest(credentials: ManagedImCredentials): Promise<string> {
  const input = new TextEncoder().encode(
    `${credentials.appKey}\0${credentials.account}\0${credentials.token}`,
  )
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = String(error.code)
    if (/^[A-Za-z0-9._-]{1,64}$/.test(value)) return value
  }
  return 'unknown'
}

function mapSelfProfile(value: unknown, expectedAccount: string): ChannelSelfProfile {
  if (!isModuleRecord(value)) throw new ChannelTransportError('protocolFailure', false)
  const accountId = requiredProfileText(value.accountId, 32)
  if (accountId !== expectedAccount) throw new ChannelTransportError('protocolFailure', false)
  const name = optionalProfileText(value.name, 64) ?? ''
  const email = optionalProfileText(value.email, 64)
  const avatarUrl = optionalProfileURL(value.avatar, 1024)
  return {
    accountId,
    name,
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  }
}

function requiredProfileText(value: unknown, maximumBytes: number): string {
  if (typeof value !== 'string' || !validProfileText(value, maximumBytes) || value.length === 0) {
    throw new ChannelTransportError('protocolFailure', false)
  }
  return value
}

function optionalProfileText(value: unknown, maximumBytes: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !validProfileText(value, maximumBytes)) {
    throw new ChannelTransportError('protocolFailure', false)
  }
  return value
}

function validProfileText(value: string, maximumBytes: number): boolean {
  return (
    value === value.trim() &&
    new TextEncoder().encode(value).byteLength <= maximumBytes &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function optionalProfileURL(value: unknown, maximumBytes: number): string | undefined {
  const candidate = optionalProfileText(value, maximumBytes)
  if (!candidate) return undefined
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new ChannelTransportError('protocolFailure', false)
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.host ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new ChannelTransportError('protocolFailure', false)
  }
  return parsed.toString()
}

function messageKey(ref: MessageRef): string {
  return `${ref.channelRef}\u0000${ref.messageServerId || ref.messageClientId}`
}
