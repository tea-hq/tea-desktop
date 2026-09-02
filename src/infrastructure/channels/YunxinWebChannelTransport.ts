import type {
  Channel,
  ChannelCapability,
  ChannelContactDirectory,
  ChannelDetails,
  ChannelEvent,
  ChannelEventListener,
  ChannelEventPayload,
  ChannelPage,
  ChannelMember,
  ChannelMemberPage,
  ChannelRef,
  ChannelSelfProfile,
  ChannelUserProfile,
  ChannelStatus,
  ChannelTransport,
  ChannelTransportDescriptor,
  CreateGroupRequest,
  DeleteMessagesRequest,
  ListSavedMessagesRequest,
  ListChannelsRequest,
  LoadMessagesRequest,
  ListChannelMembersRequest,
  MessagePage,
  MessageSearchPage,
  Message,
  MessageReaction,
  MessageReceiptDetails,
  MessageRef,
  ModifyMessageRequest,
  OutgoingMessageContent,
  Participant,
  PinMessageRequest,
  PinnedMessage,
  SavedMessage,
  SavedMessagePage,
  SaveMessageRequest,
  QuickCommentRequest,
  ReplyMessageRequest,
  ForwardMessageRequest,
  ForwardMessageResult,
  GroupMemberMuteRequest,
  GroupMemberRoleRequest,
  GroupMembersRequest,
  JsonValue,
  RevokeMessageRequest,
  SendMessageRequest,
  SendMessageResult,
  SearchMessagesRequest,
  UpdateGroupRequest,
} from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'
import type { V2NIM as BrowserSdkInstance } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK'
import type { V2NIMConversation } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMConversationService'
import type {
  V2NIMClearHistoryNotification,
  V2NIMCollection,
  V2NIMMessage,
  V2NIMMessageDeletedNotification,
  V2NIMMessagePinNotification,
  V2NIMMessagePin,
  V2NIMMessageRefer,
  V2NIMMessageQuickCommentNotification,
  V2NIMMessageRevokeNotification,
  V2NIMMessageSearchExParams,
  V2NIMP2PMessageReadReceipt,
  V2NIMTeamMessageReadReceipt,
} from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'
import type {
  V2NIMTeam,
  V2NIMTeamMember,
} from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMTeamService'
import type { V2NIMError } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/types'
import {
  mapYunxinConversation,
  mapYunxinMessage,
  mapYunxinMessageRef,
  mapYunxinRefer,
  serializeServerExtension,
} from './yunxinMapper'
import {
  decodeYunxinSavedMessagePayload,
  encodeYunxinSavedMessagePayload,
  isYunxinMessageCollectionType,
  yunxinMessageCollectionType,
  yunxinSavedMessageUniqueId,
} from './yunxinSavedMessages'
import { deriveChannelAccountRef } from './accountScope'
import {
  FORWARD_TARGET_LIMIT,
  forwardMessageEligibility,
} from '@/features/channels/messageForwarding'
import {
  defaultYunxinMergedArchiveLoader,
  deserializeYunxinMergedArchive,
  encodeYunxinMergedMessagePayload,
  serializeYunxinMergedArchive,
  type YunxinMergedArchiveLoader,
  yunxinMergedArchiveMd5,
  yunxinMergedPayloadFromMessage,
} from './yunxinMergedMessages'
import type {
  ManagedImCredentialClient,
  ManagedImCredentials,
} from './electronManagedImCredentials'
import { withYunxinMentions } from './yunxinMentions'

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
  'channel.details',
  'channel.members',
  'channel.manage',
  'channel.pin',
  'channel.mute',
  'channel.hide',
  'profile.self',
  'message.history',
  'message.search',
  'message.send.text',
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

export interface ResolvedMessageAttachment {
  path: string
  name: string
  mimeType?: string
  size?: number
  extension?: string
}

export interface MessageAttachmentResolver {
  resolve(token: string): Promise<ResolvedMessageAttachment | null>
}

const denyAllContactDirectory: ChannelContactDirectory = {
  isKnownContact: async () => false,
}

export class YunxinWebChannelTransport implements ChannelTransport {
  private sdk: YunxinSdk | null = null
  private currentStatus: ChannelStatus = { phase: 'disconnected', retryable: false }
  private listeners = new Set<ChannelEventListener>()
  private rawMessages = new Map<string, V2NIMMessage>()
  private reactions = new Map<string, Map<number, Set<string>>>()
  private sentByKey = new Map<string, SendMessageResult>()
  private forwardedByKey = new Map<string, ForwardMessageResult>()
  private savedCollections = new Map<string, V2NIMCollection>()
  private savedCursorOffsets = new Map<string, number>()
  private sequence = 0
  private listenersAttached = false
  private disposed = false
  private sdkAppKey: string | null = null
  private selfAccount: string | null = null
  private credentialFingerprint: string | null = null
  private lifecycleGeneration = 0
  private readonly activeSends = new Map<string, { cancelled: boolean }>()

  constructor(
    private readonly credentials: ManagedImCredentialClient,
    private readonly factory: YunxinSdkFactory = defaultFactory,
    private readonly attachmentResolver?: MessageAttachmentResolver,
    private readonly contactDirectory: ChannelContactDirectory = denyAllContactDirectory,
    private readonly mergedArchiveLoader: YunxinMergedArchiveLoader = defaultYunxinMergedArchiveLoader,
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
    const values = structuredClone(capabilities)
    values.push({
      id: 'message.send.media',
      available: Boolean(this.attachmentResolver),
      ...(this.attachmentResolver ? {} : { reason: 'unsupported' as const }),
    })
    return values
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
    this.activeSends.clear()
    this.setStatus({ phase: 'disconnected', retryable: false })
  }

  status(): ChannelStatus {
    return structuredClone(this.currentStatus)
  }

  async getSelfProfile(): Promise<ChannelSelfProfile> {
    const expectedAccount = this.selfAccount
    if (!expectedAccount) throw new ChannelTransportError('protocolFailure', false)
    const profiles = await this.getUserProfiles([expectedAccount])
    if (profiles.length !== 1) throw new ChannelTransportError('protocolFailure', false)
    return profiles[0]!
  }

  async getUserProfiles(accountIds: string[]): Promise<ChannelUserProfile[]> {
    const sdk = this.connectedSdk()
    const requested = normalizeAccountIds(accountIds)
    let values: unknown
    try {
      values = await sdk.V2NIMUserService.getUserListFromCloud(requested)
    } catch {
      throw new ChannelTransportError('transport', true)
    }
    if (!Array.isArray(values)) throw new ChannelTransportError('protocolFailure', false)
    const requestedSet = new Set(requested)
    const seen = new Set<string>()
    const result: ChannelUserProfile[] = []
    for (const value of values) {
      const profile = mapUserProfile(value)
      if (!requestedSet.has(profile.accountId) || seen.has(profile.accountId))
        throw new ChannelTransportError('protocolFailure', false)
      seen.add(profile.accountId)
      result.push(profile)
    }
    return result
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

  async getChannelDetails(channelRef: ChannelRef): Promise<ChannelDetails> {
    const sdk = this.connectedSdk()
    const type = sdk.V2NIMConversationIdUtil.parseConversationType(channelRef)
    if (type === 1) {
      const conversation = await sdk.V2NIMConversationService.getConversation(channelRef)
      const channel = this.mapConversation(conversation)
      if (!channel) throw new ChannelTransportError('protocolFailure', false)
      return {
        channelRef,
        name: channel.name,
        description: channel.description,
        memberCount: 2,
        chatBanned: false,
      }
    }
    const identity = teamIdentity(sdk, channelRef)
    const team = await sdk.V2NIMTeamService.getTeamInfo(identity.teamId, identity.teamType)
    return mapTeamDetails(team, channelRef)
  }

  async listChannelMembers(request: ListChannelMembersRequest): Promise<ChannelMemberPage> {
    const sdk = this.connectedSdk()
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)
      throw new ChannelTransportError('invalidRequest', false)
    const identity = teamIdentity(sdk, request.channelRef)
    const cursor = request.cursor ?? ''
    if (cursor.length > 512 || cursor.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    const result = await sdk.V2NIMTeamService.getTeamMemberList(
      identity.teamId,
      identity.teamType,
      {
        roleQueryType: 0,
        onlyChatBanned: false,
        direction: 0,
        limit: request.limit,
        nextToken: cursor,
      },
    )
    return {
      channelRef: request.channelRef,
      items: result.memberList.map(mapTeamMember),
      hasMore: !result.finished,
      ...(result.nextToken ? { nextCursor: result.nextToken } : {}),
    }
  }

  async createGroup(request: CreateGroupRequest): Promise<Channel> {
    const sdk = this.connectedSdk()
    const name = request.name.trim()
    const accountIds = uniqueAccountIds(request.memberAccountIds)
    if (!name || name.length > 200 || accountIds.length > 100)
      throw new ChannelTransportError('invalidRequest', false)
    await this.ensureKnownContacts(accountIds)
    const memberLimit = request.memberLimit
    if (
      memberLimit !== undefined &&
      (!Number.isInteger(memberLimit) || memberLimit < 2 || memberLimit > 10_000)
    )
      throw new ChannelTransportError('invalidRequest', false)
    const result = await sdk.V2NIMTeamService.createTeam(
      {
        name,
        teamType: 1,
        ...(memberLimit !== undefined ? { memberLimit } : {}),
        ...(request.description !== undefined
          ? { intro: request.description.trim().slice(0, 1_024) }
          : {}),
        ...(request.announcement !== undefined
          ? { announcement: request.announcement.trim().slice(0, 5_000) }
          : {}),
        agreeMode: 1,
      },
      accountIds,
      '',
    )
    const ref = sdk.V2NIMConversationIdUtil.teamConversationId(result.team.teamId)
    await sdk.V2NIMConversationService.createConversation(ref)
    const channel = mapYunxinTeamChannel(result.team, ref)
    this.emit({ type: 'channel.upserted', channels: [channel] })
    return channel
  }

  async updateGroup(request: UpdateGroupRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, request.channelRef)
    const hasChange =
      request.name !== undefined ||
      request.description !== undefined ||
      request.announcement !== undefined ||
      request.chatBanned !== undefined
    if (!hasChange) throw new ChannelTransportError('invalidRequest', false)
    if (request.name !== undefined && (!request.name.trim() || request.name.trim().length > 200))
      throw new ChannelTransportError('invalidRequest', false)
    await sdk.V2NIMTeamService.updateTeamInfo(identity.teamId, identity.teamType, {
      ...(request.name !== undefined ? { name: request.name.trim() } : {}),
      ...(request.description !== undefined
        ? { intro: request.description.trim().slice(0, 1_024) }
        : {}),
      ...(request.announcement !== undefined
        ? { announcement: request.announcement.trim().slice(0, 5_000) }
        : {}),
      ...(request.chatBanned !== undefined ? { chatBannedMode: request.chatBanned ? 1 : 0 } : {}),
    })
  }

  async inviteGroupMembers(request: GroupMembersRequest): Promise<{ failedAccountIds: string[] }> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, request.channelRef)
    const accountIds = uniqueAccountIds(request.accountIds)
    validateGroupAccounts(accountIds)
    await this.ensureKnownContacts(accountIds)
    const failedAccountIds = await sdk.V2NIMTeamService.inviteMember(
      identity.teamId,
      identity.teamType,
      accountIds,
      '',
    )
    return { failedAccountIds: uniqueAccountIds(failedAccountIds) }
  }

  async removeGroupMembers(request: GroupMembersRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, request.channelRef)
    const accountIds = uniqueAccountIds(request.accountIds)
    validateGroupAccounts(accountIds)
    await sdk.V2NIMTeamService.kickMember(identity.teamId, identity.teamType, accountIds)
  }

  async leaveGroup(channelRef: ChannelRef): Promise<void> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, channelRef)
    await sdk.V2NIMTeamService.leaveTeam(identity.teamId, identity.teamType)
    this.emit({ type: 'channel.deleted', channelRefs: [channelRef] })
  }

  async dismissGroup(channelRef: ChannelRef): Promise<void> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, channelRef)
    await sdk.V2NIMTeamService.dismissTeam(identity.teamId, identity.teamType)
    this.emit({ type: 'channel.deleted', channelRefs: [channelRef] })
  }

  async setGroupMemberRole(request: GroupMemberRoleRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, request.channelRef)
    const accountIds = uniqueAccountIds(request.accountIds)
    validateGroupAccounts(accountIds)
    await sdk.V2NIMTeamService.updateTeamMemberRole(
      identity.teamId,
      identity.teamType,
      accountIds,
      request.role === 'manager' ? 2 : 0,
    )
  }

  async setGroupMemberMute(request: GroupMemberMuteRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const identity = teamIdentity(sdk, request.channelRef)
    const accountId = request.accountId.trim()
    if (!accountId || accountId.length > 128)
      throw new ChannelTransportError('invalidRequest', false)
    await sdk.V2NIMTeamService.setTeamMemberChatBannedStatus(
      identity.teamId,
      identity.teamType,
      accountId,
      request.chatBanned,
    )
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

  async searchMessages(request: SearchMessagesRequest): Promise<MessageSearchPage> {
    const sdk = this.connectedSdk()
    const keyword = request.keyword.trim()
    if (!keyword || keyword.length > 512 || keyword.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    const limit = validateLimit(request.limit)
    const cursor = request.cursor
    if (cursor !== undefined && (cursor.length > 512 || cursor.includes('\0')))
      throw new ChannelTransportError('invalidRequest', false)
    if (
      request.channelRef &&
      (request.channelRef.length > 512 || request.channelRef.includes('\0'))
    )
      throw new ChannelTransportError('invalidRequest', false)

    const params: V2NIMMessageSearchExParams = {
      ...(request.channelRef ? { conversationId: request.channelRef } : {}),
      keywordList: [keyword],
      limit,
      direction: request.direction === 'oldest' ? 1 : 0,
      ...(cursor ? { pageToken: cursor } : {}),
    }
    let result
    try {
      result = await sdk.V2NIMMessageService.searchCloudMessagesEx(params)
    } catch {
      throw new ChannelTransportError('transport', true)
    }
    if (!result || !Array.isArray(result.items))
      throw new ChannelTransportError('protocolFailure', false)

    const items = result.items.flatMap((group) => {
      if (!group || !Array.isArray(group.messages)) return []
      group.messages.forEach((value) => this.rememberMessage(value))
      return group.messages
        .map((value) => mapYunxinMessage(value, this.selfAccount ?? ''))
        .filter((value) => !request.channelRef || value?.ref.channelRef === request.channelRef)
        .filter((value): value is Message => value !== null)
    })
    items.sort((left, right) => {
      const result = left.sentAt - right.sentAt
      return request.direction === 'oldest'
        ? result || left.ref.messageClientId.localeCompare(right.ref.messageClientId)
        : -result || right.ref.messageClientId.localeCompare(left.ref.messageClientId)
    })
    return {
      items,
      totalCount: Number.isInteger(result.count) && result.count >= 0 ? result.count : items.length,
      hasMore: result.hasMore === true && Boolean(result.nextPageToken),
      ...(result.nextPageToken ? { nextCursor: result.nextPageToken } : {}),
    }
  }

  async listPinnedMessages(channelRef: ChannelRef): Promise<PinnedMessage[]> {
    const sdk = this.connectedSdk()
    if (!channelRef.trim() || channelRef.length > 512 || channelRef.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    let pins: V2NIMMessagePin[]
    try {
      pins = await sdk.V2NIMMessageService.getPinnedMessageList(channelRef)
    } catch {
      throw new ChannelTransportError('transport', true)
    }
    if (!Array.isArray(pins)) throw new ChannelTransportError('protocolFailure', false)
    const validPins = pins.filter((pin) => pin?.messageRefer?.conversationId === channelRef)
    let rawMessages: V2NIMMessage[]
    try {
      rawMessages = validPins.length
        ? await sdk.V2NIMMessageService.getMessageListByRefers(
            validPins.map((pin) => pin.messageRefer),
          )
        : []
    } catch {
      throw new ChannelTransportError('transport', true)
    }
    if (!Array.isArray(rawMessages)) throw new ChannelTransportError('protocolFailure', false)
    rawMessages.forEach((value) => this.rememberMessage(value))

    const values: PinnedMessage[] = []
    for (const pin of validPins) {
      const ref = mapYunxinRefer(pin.messageRefer)
      const raw = rawMessages.find((message) =>
        sameYunxinMessageRef(mapYunxinMessageRef(message), ref),
      )
      const message = raw ? mapYunxinMessage(raw, this.selfAccount ?? '') : null
      if (!message) continue
      message.pinned = true
      values.push({
        message,
        ...(pin.opeartorId ? { pinnedByAccountId: pin.opeartorId } : {}),
        pinnedAt: nonNegativeTimestamp(pin.createTime || pin.updateTime),
      })
    }
    return values.sort((left, right) => right.pinnedAt - left.pinnedAt)
  }

  async saveMessage(request: SaveMessageRequest): Promise<SavedMessage> {
    const sdk = this.connectedSdk()
    const raw = this.rawMessageForRef(request.messageRef)
    const serialized = sdk.V2NIMMessageConverter.messageSerialization(raw)
    if (!serialized) throw new ChannelTransportError('unsupportedCapability', false)
    const mapped = mapYunxinMessage(raw, this.selfAccount ?? '')
    if (!mapped || mapped.state !== 'active')
      throw new ChannelTransportError('invalidRequest', false)
    let collection: V2NIMCollection
    try {
      collection = await sdk.V2NIMMessageService.addCollection({
        collectionType: yunxinMessageCollectionType(raw.messageType),
        collectionData: encodeYunxinSavedMessagePayload({
          message: serialized,
          sourceChannelName: request.sourceChannelName,
          senderName: mapped.sender.name,
          avatarUrl: mapped.sender.avatarUrl,
        }),
        uniqueId: yunxinSavedMessageUniqueId(raw),
      })
    } catch (error) {
      throw savedMessageError(error)
    }
    const value = this.mapSavedCollection(collection, sdk)
    if (!value) throw new ChannelTransportError('protocolFailure', false)
    this.savedCollections.set(collection.collectionId, collection)
    return value
  }

  async listSavedMessages(request: ListSavedMessagesRequest): Promise<SavedMessagePage> {
    const sdk = this.connectedSdk()
    const limit = validateLimit(request.limit)
    const cursor = request.cursor?.trim()
    if (cursor && (cursor.length > 512 || cursor.includes('\0')))
      throw new ChannelTransportError('invalidRequest', false)
    const anchorCollection = cursor ? this.savedCollections.get(cursor) : undefined
    const offset = cursor ? this.savedCursorOffsets.get(cursor) : 0
    if (cursor && !anchorCollection) throw new ChannelTransportError('invalidRequest', false)
    if (offset === undefined) throw new ChannelTransportError('invalidRequest', false)
    let result
    try {
      result = await sdk.V2NIMMessageService.getCollectionListExByOption({
        collectionType: 0,
        limit,
        direction: 0,
        ...(anchorCollection ? { anchorCollection } : {}),
      })
    } catch (error) {
      throw savedMessageError(error)
    }
    if (
      !result ||
      !Array.isArray(result.collectionList) ||
      !Number.isInteger(result.totalCount) ||
      result.totalCount < 0
    )
      throw new ChannelTransportError('protocolFailure', false)
    for (const collection of result.collectionList) {
      if (collection?.collectionId) this.savedCollections.set(collection.collectionId, collection)
    }
    const items = result.collectionList
      .map((collection) => this.mapSavedCollection(collection, sdk))
      .filter((value): value is SavedMessage => value !== null)
      .sort((left, right) => right.savedAt - left.savedAt || right.id.localeCompare(left.id))
    const last = result.collectionList.at(-1)
    const consumed = offset + result.collectionList.length
    if (last?.collectionId) this.savedCursorOffsets.set(last.collectionId, consumed)
    const hasMore = consumed < result.totalCount && Boolean(last?.collectionId)
    return {
      items,
      totalCount: result.totalCount,
      hasMore,
      ...(hasMore && last ? { nextCursor: last.collectionId } : {}),
    }
  }

  async removeSavedMessage(savedMessageId: string): Promise<void> {
    const sdk = this.connectedSdk()
    const id = savedMessageId.trim()
    if (!id || id.length > 512 || id.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    const collection = this.savedCollections.get(id)
    if (!collection) throw new ChannelTransportError('invalidRequest', false)
    let removedCount: number
    try {
      removedCount = await sdk.V2NIMMessageService.removeCollections([collection])
    } catch (error) {
      throw savedMessageError(error)
    }
    if (!Number.isInteger(removedCount) || removedCount < 1)
      throw new ChannelTransportError('protocolFailure', false)
    this.savedCollections.delete(id)
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    const sdk = this.connectedSdk()
    const operationId = this.beginSendOperation(request.operationId)
    try {
      if (request.idempotencyKey) {
        const existing = this.sentByKey.get(request.idempotencyKey)
        if (existing) return structuredClone(existing)
      }
      const serverExtension = outgoingServerExtension(request)
      const message = await createYunxinOutgoingMessage(
        sdk,
        request.content,
        this.attachmentResolver,
      )
      message.serverExtension = serverExtension
      await this.ensureDirectRecipient(request.channelRef, sdk)
      const result = await this.sendProviderMessage(request.operationId, () => {
        const params = { messageConfig: { readReceiptEnabled: true } }
        return request.operationId
          ? sdk.V2NIMMessageService.sendMessage(message, request.channelRef, params, (progress) =>
              this.reportSendProgress(request.operationId, progress),
            )
          : sdk.V2NIMMessageService.sendMessage(message, request.channelRef, params)
      })
      this.rememberMessage(result.message)
      this.emitMessages([result.message])
      const sendResult = {
        ref: mapYunxinMessageRef(result.message),
        sentAt: result.message.createTime,
      }
      if (request.idempotencyKey) this.sentByKey.set(request.idempotencyKey, sendResult)
      return sendResult
    } catch (error) {
      throw outgoingMessageError(error)
    } finally {
      this.endSendOperation(operationId)
    }
  }

  async replyMessage(request: ReplyMessageRequest): Promise<SendMessageResult> {
    const sdk = this.connectedSdk()
    const replyMessage = this.rawMessageForRef(request.replyTo)
    if (replyMessage.conversationId !== request.channelRef)
      throw new ChannelTransportError('invalidRequest', false)
    const operationId = this.beginSendOperation(request.operationId)
    try {
      if (request.idempotencyKey) {
        const existing = this.sentByKey.get(request.idempotencyKey)
        if (existing) return structuredClone(existing)
      }
      const serverExtension = outgoingServerExtension(request)
      const message = await createYunxinOutgoingMessage(
        sdk,
        request.content,
        this.attachmentResolver,
      )
      message.serverExtension = serverExtension
      const result = await this.sendProviderMessage(request.operationId, () => {
        const params = { messageConfig: { readReceiptEnabled: true } }
        return request.operationId
          ? sdk.V2NIMMessageService.replyMessage(message, replyMessage, params, (progress) =>
              this.reportSendProgress(request.operationId, progress),
            )
          : sdk.V2NIMMessageService.replyMessage(message, replyMessage, params)
      })
      this.rememberMessage(result.message)
      this.emitMessages([result.message])
      const sendResult = {
        ref: mapYunxinMessageRef(result.message),
        sentAt: result.message.createTime,
      }
      if (request.idempotencyKey) this.sentByKey.set(request.idempotencyKey, sendResult)
      return sendResult
    } catch (error) {
      throw outgoingMessageError(error)
    } finally {
      this.endSendOperation(operationId)
    }
  }

  async cancelMessageSend(operationId: string): Promise<void> {
    const value = operationId.trim()
    if (!value || value.length > 128) throw new ChannelTransportError('invalidRequest', false)
    const operation = this.activeSends.get(value)
    if (operation) operation.cancelled = true
  }

  async forwardMessage(request: ForwardMessageRequest): Promise<ForwardMessageResult> {
    const sdk = this.connectedSdk()
    const targets = [...new Set(request.targetChannelRefs.map((ref) => ref.trim()).filter(Boolean))]
    if (!targets.length || targets.length > FORWARD_TARGET_LIMIT)
      throw new ChannelTransportError('invalidRequest', false)
    if (
      !request.messageRefs.length ||
      new Set(request.messageRefs.map((ref) => ref.channelRef)).size !== 1
    )
      throw new ChannelTransportError('invalidRequest', false)
    const pairs = request.messageRefs
      .map((ref) => {
        const raw = this.rawMessageForRef(ref)
        const message = mapYunxinMessage(raw, this.selfAccount ?? '')
        if (!message) throw new ChannelTransportError('invalidRequest', false)
        return { raw, message }
      })
      .sort(
        (left, right) =>
          left.message.sentAt - right.message.sentAt ||
          left.message.ref.messageClientId.localeCompare(right.message.ref.messageClientId),
      )
    const eligibility = forwardMessageEligibility(
      pairs.map((pair) => pair.message),
      request.mode,
    )
    if (!eligibility.eligible)
      throw new ChannelTransportError(
        eligibility.reason === 'unsupportedContent' ? 'unsupportedCapability' : 'invalidRequest',
        false,
      )
    const comment = request.comment?.trim()
    if (comment && comment.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    const sourceChannelName = request.sourceChannelName?.trim()
    if (sourceChannelName && sourceChannelName.length > 200)
      throw new ChannelTransportError('invalidRequest', false)
    const idempotencyKey = request.idempotencyKey?.trim()
    if (idempotencyKey && idempotencyKey.length > 128)
      throw new ChannelTransportError('invalidRequest', false)
    if (idempotencyKey) {
      const existing = this.forwardedByKey.get(idempotencyKey)
      if (existing) return structuredClone(existing)
    }
    for (const channelRef of targets) await this.ensureDirectRecipient(channelRef, sdk)

    const results: SendMessageResult[] = []
    if (request.mode === 'individual') {
      for (const channelRef of targets) {
        for (const pair of pairs) {
          const message = sdk.V2NIMMessageCreator.createForwardMessage(pair.raw)
          if (!message) throw new ChannelTransportError('unsupportedCapability', false)
          results.push(await this.sendForwardedProviderMessage(sdk, message, channelRef))
        }
        if (comment)
          results.push(
            await this.sendForwardedProviderMessage(
              sdk,
              sdk.V2NIMMessageCreator.createTextMessage(comment),
              channelRef,
            ),
          )
      }
    } else {
      const archive = serializeYunxinMergedArchive(
        pairs.map((pair) => ({
          message: pair.raw,
          senderName: pair.message.sender.name,
          ...(pair.message.sender.avatarUrl ? { avatarUrl: pair.message.sender.avatarUrl } : {}),
        })),
        sdk.V2NIMMessageConverter,
        {
          appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
          sdkVersion: readSdkVersion(sdk),
        },
      )
      const uploadTask = sdk.V2NIMStorageService.createUploadFileTask({
        fileObj: new File([archive], 'mergedMsgs.txt', { type: 'text/plain' }),
      })
      let url: string
      try {
        url = await sdk.V2NIMStorageService.uploadFile(uploadTask, () => undefined)
      } catch {
        throw new ChannelTransportError('transport', true)
      }
      const sourceRef = request.messageRefs[0]!.channelRef
      const sessionId = sourceSessionId(sdk, sourceRef)
      let payload: string
      try {
        payload = encodeYunxinMergedMessagePayload({
          abstracts: pairs.slice(0, 3).map((pair) => ({
            senderAccountId: pair.message.sender.id,
            senderName: pair.message.sender.name,
            text: pair.message.content.kind === 'merged' ? '[Chat history]' : pair.message.text,
          })),
          depth: eligibility.depth!,
          md5: yunxinMergedArchiveMd5(archive),
          sessionId,
          sessionName: sourceChannelName || sessionId,
          url,
        })
      } catch {
        throw new ChannelTransportError('protocolFailure', false)
      }
      for (const channelRef of targets) {
        results.push(
          await this.sendForwardedProviderMessage(
            sdk,
            sdk.V2NIMMessageCreator.createCustomMessage('[Chat history]', payload),
            channelRef,
          ),
        )
        if (comment)
          results.push(
            await this.sendForwardedProviderMessage(
              sdk,
              sdk.V2NIMMessageCreator.createTextMessage(comment),
              channelRef,
            ),
          )
      }
    }
    const forwarded = { messages: results }
    if (idempotencyKey) this.forwardedByKey.set(idempotencyKey, structuredClone(forwarded))
    return forwarded
  }

  async loadMergedMessages(messageRef: MessageRef): Promise<Message[]> {
    const sdk = this.connectedSdk()
    const raw = this.rawMessageForRef(messageRef)
    const payload = yunxinMergedPayloadFromMessage(raw)
    if (!payload) throw new ChannelTransportError('invalidRequest', false)
    let archive: string
    try {
      archive = await this.mergedArchiveLoader.load(payload.data.url)
    } catch (error) {
      throw mergedArchiveLoadError(error)
    }
    if (yunxinMergedArchiveMd5(archive) !== payload.data.md5)
      throw new ChannelTransportError('protocolFailure', false)
    let values: V2NIMMessage[]
    try {
      values = deserializeYunxinMergedArchive(archive, sdk.V2NIMMessageConverter)
    } catch {
      throw new ChannelTransportError('protocolFailure', false)
    }
    values.forEach((value) => this.rememberMessage(value))
    const messages = values
      .map((value) => mapYunxinMessage(value, this.selfAccount ?? ''))
      .filter((value) => value !== null)
    if (!messages.length) throw new ChannelTransportError('protocolFailure', false)
    return messages
  }

  async modifyMessage(request: ModifyMessageRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const message = this.rawMessageForRef(request.messageRef)
    const text = request.text.trim()
    if (!text || text.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
    await sdk.V2NIMMessageService.modifyMessage(message, {
      text,
      ...(request.serverExtension !== undefined
        ? { serverExtension: serializeServerExtension(request.serverExtension) }
        : {}),
    })
  }

  async deleteMessages(request: DeleteMessagesRequest): Promise<void> {
    const sdk = this.connectedSdk()
    if (!request.messageRefs.length || request.messageRefs.length > 50)
      throw new ChannelTransportError('invalidRequest', false)
    const messages = request.messageRefs.map((ref) => this.rawMessageForRef(ref))
    const channelRef = messages[0]!.conversationId
    if (messages.some((message) => message.conversationId !== channelRef))
      throw new ChannelTransportError('invalidRequest', false)
    await sdk.V2NIMMessageService.deleteMessages(messages)
  }

  async revokeMessage(request: RevokeMessageRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const message = this.rawMessageForRef(request.messageRef)
    const postscript = request.postscript?.trim()
    if (postscript && postscript.length > 512)
      throw new ChannelTransportError('invalidRequest', false)
    await sdk.V2NIMMessageService.revokeMessage(message, postscript ? { postscript } : undefined)
  }

  async pinMessage(request: PinMessageRequest): Promise<void> {
    const sdk = this.connectedSdk()
    const message = this.rawMessageForRef(request.messageRef)
    if (request.pinned) await sdk.V2NIMMessageService.pinMessage(message)
    else await sdk.V2NIMMessageService.unpinMessage(toYunxinRefer(message))
  }

  async quickComment(request: QuickCommentRequest): Promise<void> {
    const sdk = this.connectedSdk()
    if (!Number.isInteger(request.type) || request.type < 0 || request.type > 1_000)
      throw new ChannelTransportError('invalidRequest', false)
    const message = this.rawMessageForRef(request.messageRef)
    if (request.active) {
      await sdk.V2NIMMessageService.addQuickComment(message, request.type)
    } else {
      await sdk.V2NIMMessageService.removeQuickComment(toYunxinRefer(message), request.type)
    }
  }

  async openDirectConversation(accountId: string): Promise<ChannelRef> {
    const sdk = this.connectedSdk()
    const target = accountId.trim()
    if (!target || target === this.selfAccount)
      throw new ChannelTransportError('invalidRequest', false)
    await this.ensureFriend(target, sdk)
    const channelRef = sdk.V2NIMConversationIdUtil.p2pConversationId(target)
    await sdk.V2NIMConversationService.createConversation(channelRef)
    return channelRef
  }

  /**
   * Tea Center is the contact source of truth. Yunxin still requires a local
   * friend relation for P2P sends, so establish it immediately before opening
   * the conversation. Add mode 1 is the no-consent path agreed by the product.
   */
  private async ensureFriend(target: string, sdk: YunxinSdk): Promise<void> {
    try {
      await this.ensureKnownContacts([target])
      const result = await sdk.V2NIMFriendService.checkFriend([target])
      if (typeof result?.[target] !== 'boolean')
        throw new ChannelTransportError('protocolFailure', false)
      if (!result[target]) {
        await sdk.V2NIMFriendService.addFriend(target, { addMode: 1, postscript: '' })
      }
    } catch (error) {
      if (error instanceof ChannelTransportError) throw error
      throw new ChannelTransportError('transport', true)
    }
  }

  private async ensureKnownContacts(accountIds: string[]): Promise<void> {
    if (!accountIds.length) return
    try {
      const known = await Promise.all(
        accountIds.map((accountId) => this.contactDirectory!.isKnownContact(accountId)),
      )
      if (known.some((value) => value !== true))
        throw new ChannelTransportError('invalidRequest', false)
    } catch (error) {
      if (error instanceof ChannelTransportError) throw error
      throw new ChannelTransportError('transport', true)
    }
  }

  private async ensureDirectRecipient(channelRef: ChannelRef, sdk: YunxinSdk): Promise<void> {
    try {
      if (sdk.V2NIMConversationIdUtil.parseConversationType(channelRef) !== 1) return
      const target = sdk.V2NIMConversationIdUtil.parseConversationTargetId(channelRef).trim()
      if (!target || target === this.selfAccount)
        throw new ChannelTransportError('invalidRequest', false)
      await this.ensureFriend(target, sdk)
    } catch (error) {
      if (error instanceof ChannelTransportError) throw error
      throw new ChannelTransportError('protocolFailure', false)
    }
  }

  async markRead(channelRef: ChannelRef): Promise<void> {
    const sdk = this.connectedSdk()
    await sdk.V2NIMConversationService.markConversationRead(channelRef)
    const incoming = [...this.rawMessages.values()]
      .filter(
        (message) =>
          message.conversationId === channelRef &&
          !message.isDelete &&
          !message.isSelf &&
          message.senderId !== this.selfAccount,
      )
      .sort((left, right) => left.createTime - right.createTime)
    if (!incoming.length) return
    const type = sdk.V2NIMConversationIdUtil.parseConversationType(channelRef)
    if (type === 1) {
      await sdk.V2NIMMessageService.sendP2PMessageReceipt(incoming.at(-1)!)
    } else if (type === 2) {
      await sdk.V2NIMMessageService.sendTeamMessageReceipts(incoming.slice(-50))
    }
  }

  async setChannelPinned(channelRef: ChannelRef, pinned: boolean): Promise<void> {
    if (typeof pinned !== 'boolean') throw new ChannelTransportError('invalidRequest', false)
    const sdk = this.connectedSdk()
    conversationIdentity(sdk, channelRef)
    try {
      await sdk.V2NIMConversationService.stickTopConversation(channelRef, pinned)
      await this.emitControlledConversation(channelRef, { pinned })
    } catch (error) {
      if (error instanceof ChannelTransportError) throw error
      throw new ChannelTransportError('transport', true)
    }
  }

  async setChannelMuted(channelRef: ChannelRef, muted: boolean): Promise<void> {
    if (typeof muted !== 'boolean') throw new ChannelTransportError('invalidRequest', false)
    const sdk = this.connectedSdk()
    const identity = conversationIdentity(sdk, channelRef)
    try {
      if (identity.type === 'direct')
        await sdk.V2NIMSettingService.setP2PMessageMuteMode(identity.targetId, muted ? 1 : 0)
      else await sdk.V2NIMSettingService.setTeamMessageMuteMode(identity.targetId, 1, muted ? 1 : 0)
      await this.emitControlledConversation(channelRef, { muted })
    } catch (error) {
      if (error instanceof ChannelTransportError) throw error
      throw new ChannelTransportError('transport', true)
    }
  }

  async hideChannel(channelRef: ChannelRef): Promise<void> {
    const sdk = this.connectedSdk()
    conversationIdentity(sdk, channelRef)
    try {
      await sdk.V2NIMConversationService.deleteConversation(channelRef, false)
      this.emit({ type: 'channel.deleted', channelRefs: [channelRef] })
    } catch (error) {
      if (error instanceof ChannelTransportError) throw error
      throw new ChannelTransportError('transport', true)
    }
  }

  async getMessageReceiptDetails(messageRef: MessageRef): Promise<MessageReceiptDetails> {
    const sdk = this.connectedSdk()
    const message = this.rawMessageForRef(messageRef)
    if (
      sdk.V2NIMConversationIdUtil.parseConversationType(message.conversationId) !== 2 ||
      !message.isSelf
    )
      throw new ChannelTransportError('invalidRequest', false)

    let detail
    try {
      detail = await sdk.V2NIMMessageService.getTeamMessageReceiptDetail(message)
    } catch {
      throw new ChannelTransportError('transport', true)
    }
    if (
      !detail ||
      !Array.isArray(detail.readAccountList) ||
      !Array.isArray(detail.unreadAccountList) ||
      [...detail.readAccountList, ...detail.unreadAccountList].some(
        (accountId) => typeof accountId !== 'string' || !accountId.trim() || accountId.length > 128,
      ) ||
      !Number.isInteger(detail.readReceipt?.readCount) ||
      !Number.isInteger(detail.readReceipt?.unreadCount)
    )
      throw new ChannelTransportError('protocolFailure', false)

    const accountIds = uniqueAccountIds([...detail.readAccountList, ...detail.unreadAccountList])
    const profiles = await loadReceiptProfiles(sdk, accountIds, this.selfAccount)
    return {
      messageRef: structuredClone(messageRef),
      read: detail.readAccountList.map(
        (accountId) => profiles.get(accountId) ?? fallbackParticipant(accountId, this.selfAccount),
      ),
      unread: detail.unreadAccountList.map(
        (accountId) => profiles.get(accountId) ?? fallbackParticipant(accountId, this.selfAccount),
      ),
      readCount: Math.max(0, detail.readReceipt.readCount),
      unreadCount: Math.max(0, detail.readReceipt.unreadCount),
    }
  }

  private async sendProviderMessage<T>(
    operationId: string | undefined,
    send: () => Promise<T>,
  ): Promise<T> {
    const value = operationId?.trim()
    if (!value) return send()
    if (value.length > 128) throw new ChannelTransportError('invalidRequest', false)
    const existing = this.activeSends.get(value)
    const operation = existing ?? { cancelled: false }
    if (!existing) this.activeSends.set(value, operation)
    try {
      if (operation.cancelled) throw new ChannelTransportError('transport', true)
      return await send()
    } catch (error) {
      if (operation.cancelled) throw new ChannelTransportError('transport', true)
      throw error
    } finally {
      if (!existing) this.activeSends.delete(value)
    }
  }

  private beginSendOperation(operationId: string | undefined): string | undefined {
    const value = operationId?.trim()
    if (!value) return undefined
    if (value.length > 128) throw new ChannelTransportError('invalidRequest', false)
    if (this.activeSends.has(value)) throw new ChannelTransportError('invalidRequest', false)
    this.activeSends.set(value, { cancelled: false })
    return value
  }

  private endSendOperation(operationId: string | undefined): void {
    if (operationId) this.activeSends.delete(operationId)
  }

  private reportSendProgress(operationId: string | undefined, progress: number): void {
    if (!operationId) return
    const operation = this.activeSends.get(operationId)
    if (!operation || operation.cancelled) throw new ChannelTransportError('transport', true)
    this.emit({
      type: 'message.sendProgress',
      operationId,
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
    })
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
    this.activeSends.clear()
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

  private async emitControlledConversation(
    channelRef: ChannelRef,
    preferences: Partial<Pick<Channel, 'pinned' | 'muted'>>,
  ): Promise<void> {
    const sdk = this.connectedSdk()
    const value = await sdk.V2NIMConversationService.getConversation(channelRef)
    const channel = this.mapConversation(value)
    if (!channel) throw new ChannelTransportError('protocolFailure', false)
    this.emit({ type: 'channel.upserted', channels: [{ ...channel, ...preferences }] })
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

  private mapSavedCollection(collection: V2NIMCollection, sdk: YunxinSdk): SavedMessage | null {
    if (!collection?.collectionId || !isYunxinMessageCollectionType(collection.collectionType))
      return null
    const payload = decodeYunxinSavedMessagePayload(collection.collectionData)
    if (!payload) return null
    let raw: V2NIMMessage | null
    try {
      raw = sdk.V2NIMMessageConverter.messageDeserialization(payload.message)
    } catch {
      return null
    }
    if (!raw) return null
    const message = mapYunxinMessage(raw, this.selfAccount ?? '')
    if (!message) return null
    this.rememberMessage(raw)
    message.sender = {
      ...message.sender,
      ...(payload.senderName ? { name: payload.senderName } : {}),
      ...(payload.avatarUrl ? { avatarUrl: payload.avatarUrl } : {}),
    }
    return {
      id: collection.collectionId,
      message,
      savedAt: nonNegativeTimestamp(collection.createTime || collection.updateTime),
      ...(payload.sourceChannelName ? { sourceChannelName: payload.sourceChannelName } : {}),
    }
  }

  private rawMessageForRef(ref: MessageRef): V2NIMMessage {
    for (const value of this.rawMessages.values()) {
      const candidate = mapYunxinMessageRef(value)
      if (
        candidate.channelRef === ref.channelRef &&
        (candidate.messageClientId === ref.messageClientId ||
          Boolean(
            candidate.messageServerId &&
            ref.messageServerId &&
            candidate.messageServerId === ref.messageServerId,
          ))
      )
        return value
    }
    throw new ChannelTransportError('invalidRequest', false)
  }

  private async sendForwardedProviderMessage(
    sdk: YunxinSdk,
    message: V2NIMMessage,
    channelRef: ChannelRef,
  ): Promise<SendMessageResult> {
    const result = await sdk.V2NIMMessageService.sendMessage(message, channelRef, {
      messageConfig: { readReceiptEnabled: true },
    })
    this.rememberMessage(result.message)
    this.emitMessages([result.message])
    return { ref: mapYunxinMessageRef(result.message), sentAt: result.message.createTime }
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
    this.forwardedByKey.clear()
    this.savedCollections.clear()
    this.savedCursorOffsets.clear()
  }
}

function savedMessageError(error: unknown): ChannelTransportError {
  const value = error as {
    code?: unknown
    errorCode?: unknown
    messageStatus?: { errorCode?: unknown }
  }
  if (
    value?.code === 189301 ||
    value?.errorCode === 189301 ||
    value?.messageStatus?.errorCode === 189301
  )
    return new ChannelTransportError('limitExceeded', false)
  return new ChannelTransportError('transport', true)
}

function mergedArchiveLoadError(error: unknown): ChannelTransportError {
  const message = error instanceof Error ? error.message : ''
  return message === 'mergedMessageArchiveUrlInvalid' || message === 'mergedMessageArchiveTooLarge'
    ? new ChannelTransportError('protocolFailure', false)
    : new ChannelTransportError('transport', true)
}

function toYunxinRefer(value: V2NIMMessage): V2NIMMessageRefer {
  return {
    senderId: value.senderId,
    receiverId: value.receiverId,
    messageClientId: value.messageClientId,
    messageServerId: value.messageServerId,
    createTime: value.createTime,
    conversationType: value.conversationType,
    conversationId: value.conversationId,
  }
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ChannelTransportError('invalidRequest', false)
  return limit
}

function sourceSessionId(sdk: YunxinSdk, channelRef: ChannelRef): string {
  try {
    const value = sdk.V2NIMConversationIdUtil.parseConversationTargetId(channelRef).trim()
    if (!value || value.length > 200) throw new Error('invalid')
    return value
  } catch {
    throw new ChannelTransportError('invalidRequest', false)
  }
}

function conversationIdentity(
  sdk: YunxinSdk,
  channelRef: ChannelRef,
): { type: 'direct' | 'group'; targetId: string } {
  let conversationType: number
  let targetId: string
  try {
    conversationType = sdk.V2NIMConversationIdUtil.parseConversationType(channelRef)
    targetId = sdk.V2NIMConversationIdUtil.parseConversationTargetId(channelRef).trim()
  } catch {
    throw new ChannelTransportError('invalidRequest', false)
  }
  if ((conversationType !== 1 && conversationType !== 2) || !targetId || targetId.length > 128)
    throw new ChannelTransportError('unsupportedCapability', false)
  return { type: conversationType === 1 ? 'direct' : 'group', targetId }
}

function readSdkVersion(sdk: YunxinSdk): string {
  const value = (sdk as unknown as { version?: unknown }).version
  return typeof value === 'string' ? value.slice(0, 100) : ''
}

function teamIdentity(sdk: YunxinSdk, channelRef: ChannelRef): { teamId: string; teamType: 1 | 2 } {
  let conversationType: number
  let teamId: string
  try {
    conversationType = sdk.V2NIMConversationIdUtil.parseConversationType(channelRef)
    teamId = sdk.V2NIMConversationIdUtil.parseConversationTargetId(channelRef).trim()
  } catch {
    throw new ChannelTransportError('invalidRequest', false)
  }
  if ((conversationType !== 2 && conversationType !== 3) || !teamId || teamId.length > 128)
    throw new ChannelTransportError('unsupportedCapability', false)
  return { teamId, teamType: conversationType === 2 ? 1 : 2 }
}

function mapTeamDetails(team: V2NIMTeam, channelRef: ChannelRef): ChannelDetails {
  return {
    channelRef,
    name: boundedTeamText(team.name || channelRef, 200),
    description: boundedTeamText(team.intro || '', 1_024),
    ...(team.announcement ? { announcement: boundedTeamText(team.announcement, 5_000) } : {}),
    ...(team.ownerAccountId ? { ownerAccountId: boundedTeamText(team.ownerAccountId, 128) } : {}),
    memberCount: Math.max(0, team.memberCount),
    ...(Number.isFinite(team.memberLimit) && team.memberLimit > 0
      ? { memberLimit: team.memberLimit }
      : {}),
    chatBanned: team.chatBannedMode !== 0,
  }
}

function mapYunxinTeamChannel(team: V2NIMTeam, channelRef: ChannelRef): Channel {
  return {
    ref: channelRef,
    kind: 'group',
    name: boundedTeamText(team.name || channelRef, 200),
    ...(team.avatar ? { avatarUrl: boundedTeamUrl(team.avatar) } : {}),
    description: boundedTeamText(team.intro || '', 1_024),
    memberCount: Math.max(0, team.memberCount),
    pinned: false,
    muted: false,
    unreadCount: 0,
    updatedAt: Date.now(),
  }
}

function mapTeamMember(member: V2NIMTeamMember): ChannelMember {
  return {
    accountId: boundedTeamText(member.accountId, 128),
    name: boundedTeamText(member.teamNick?.trim() || member.accountId, 200),
    role: member.memberRole === 1 ? 'owner' : member.memberRole === 2 ? 'manager' : 'member',
    ...(member.joinTime > 0 ? { joinedAt: member.joinTime } : {}),
    chatBanned: member.chatBanned === true,
  }
}

function boundedTeamText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum)
}

function boundedTeamUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || value.length > 2_048)
      return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function uniqueAccountIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function validateGroupAccounts(accountIds: string[]): void {
  if (
    !accountIds.length ||
    accountIds.length > 100 ||
    accountIds.some((value) => value.length > 128)
  )
    throw new ChannelTransportError('invalidRequest', false)
}

function outgoingServerExtension(
  request: Pick<SendMessageRequest, 'content' | 'mentions' | 'serverExtension' | 'idempotencyKey'>,
): string | undefined {
  if (request.mentions?.length && request.content.kind !== 'text')
    throw new ChannelTransportError('invalidRequest', false)
  try {
    const extension = withClientReference(request.serverExtension, request.idempotencyKey)
    return serializeServerExtension(
      withYunxinMentions(
        extension,
        request.mentions,
        request.content.kind === 'text' ? request.content.text : '',
      ),
    )
  } catch {
    throw new ChannelTransportError('invalidRequest', false)
  }
}

function withClientReference(
  extension: JsonValue | undefined,
  clientReference: string | undefined,
): JsonValue | undefined {
  const value = clientReference?.trim()
  if (!value) return extension
  if (value.length > 128 || (extension !== undefined && !isJsonRecord(extension)))
    throw new ChannelTransportError('invalidRequest', false)
  return { ...(extension ?? {}), teaClientReference: value }
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function loadReceiptProfiles(
  sdk: YunxinSdk,
  accountIds: string[],
  selfAccount: string | null,
): Promise<Map<string, Participant>> {
  const result = new Map<string, Participant>()
  for (let offset = 0; offset < accountIds.length; offset += 150) {
    let values: unknown
    try {
      values = await sdk.V2NIMUserService.getUserListFromCloud(
        accountIds.slice(offset, offset + 150),
      )
    } catch {
      continue
    }
    if (!Array.isArray(values)) continue
    for (const value of values) {
      const participant = mapReceiptParticipant(value, selfAccount)
      if (participant) result.set(participant.id, participant)
    }
  }
  return result
}

function mapReceiptParticipant(value: unknown, selfAccount: string | null): Participant | null {
  if (!isModuleRecord(value)) return null
  const accountId = boundedTeamText(
    typeof value.accountId === 'string' ? value.accountId.trim() : '',
    128,
  )
  if (!accountId) return null
  const name = boundedTeamText(
    typeof value.name === 'string' && value.name.trim() ? value.name.trim() : accountId,
    200,
  )
  const avatarUrl = typeof value.avatar === 'string' ? boundedTeamUrl(value.avatar) : undefined
  return {
    id: accountId,
    name,
    ...(avatarUrl ? { avatarUrl } : {}),
    isCurrentUser: accountId === selfAccount,
  }
}

function fallbackParticipant(accountId: string, selfAccount: string | null): Participant {
  const id = boundedTeamText(accountId.trim(), 128)
  return { id, name: id, isCurrentUser: id === selfAccount }
}

async function createYunxinOutgoingMessage(
  sdk: YunxinSdk,
  content: OutgoingMessageContent,
  attachmentResolver?: MessageAttachmentResolver,
): Promise<V2NIMMessage> {
  switch (content.kind) {
    case 'text': {
      const text = content.text.trim()
      if (!text || text.length > 8_000) throw new ChannelTransportError('invalidRequest', false)
      return sdk.V2NIMMessageCreator.createTextMessage(text)
    }
    case 'location':
      return sdk.V2NIMMessageCreator.createLocationMessage(
        content.latitude,
        content.longitude,
        content.address,
      )
    case 'custom': {
      if (!content.raw || content.raw.length > 4_096)
        throw new ChannelTransportError('invalidRequest', false)
      const creator = sdk.V2NIMMessageCreator
      if (!creator.createCustomMessageWithAttachment)
        return creator.createCustomMessage(content.text, content.raw)
      return creator.createCustomMessageWithAttachment({ raw: content.raw }, content.subtype)
    }
    case 'call':
      return sdk.V2NIMMessageCreator.createCallMessage(
        content.callType,
        content.channelId,
        content.status,
        content.durations.map((duration) => ({
          accountId: duration.accountId,
          duration: duration.durationMs,
        })),
        content.text,
      )
    case 'tips':
      return sdk.V2NIMMessageCreator.createTipsMessage(content.text)
    case 'image':
    case 'audio':
    case 'video':
    case 'file': {
      if (!attachmentResolver) throw new ChannelTransportError('unsupportedCapability', false)
      const token = content.media.source.token.trim()
      if (!token || token.length > 256) throw new ChannelTransportError('invalidRequest', false)
      const attachment = await attachmentResolver.resolve(token)
      if (!attachment) throw new ChannelTransportError('invalidRequest', false)
      const name = content.media.name?.trim() || attachment.name
      if (!name || name.length > 512) throw new ChannelTransportError('invalidRequest', false)
      const creator = sdk.V2NIMMessageCreator
      if (content.kind === 'image')
        return creator.createImageMessage(
          attachment.path,
          name,
          undefined,
          content.media.width,
          content.media.height,
        )
      if (content.kind === 'audio')
        return creator.createAudioMessage(
          attachment.path,
          name,
          undefined,
          content.media.durationMs,
        )
      if (content.kind === 'video')
        return creator.createVideoMessage(
          attachment.path,
          name,
          undefined,
          content.media.durationMs,
          content.media.width,
          content.media.height,
        )
      return creator.createFileMessage(attachment.path, name)
    }
  }
}

function outgoingMessageError(error: unknown): ChannelTransportError {
  return error instanceof ChannelTransportError
    ? error
    : new ChannelTransportError('transport', true)
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

function mapUserProfile(value: unknown): ChannelUserProfile {
  if (!isModuleRecord(value)) throw new ChannelTransportError('protocolFailure', false)
  const accountId = requiredProfileText(value.accountId, 32)
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

function normalizeAccountIds(accountIds: string[]): string[] {
  if (
    !Array.isArray(accountIds) ||
    accountIds.length === 0 ||
    accountIds.length > 100 ||
    accountIds.some((value) => typeof value !== 'string')
  )
    throw new ChannelTransportError('invalidRequest', false)
  const values = accountIds.map((value) => value.trim())
  if (values.some((value) => !value || value.length > 128))
    throw new ChannelTransportError('invalidRequest', false)
  return [...new Set(values)]
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

function sameYunxinMessageRef(left: MessageRef, right: MessageRef): boolean {
  return (
    left.channelRef === right.channelRef &&
    (left.messageClientId === right.messageClientId ||
      Boolean(
        left.messageServerId &&
        right.messageServerId &&
        left.messageServerId === right.messageServerId,
      ))
  )
}

function nonNegativeTimestamp(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}
