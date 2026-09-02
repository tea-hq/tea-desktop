import type {
  Channel,
  ChannelContactDirectory,
  ChannelEvent,
  ChannelPage,
  ChannelDetails,
  ChannelMemberPage,
  ChannelStatus,
  ChannelUserProfile,
  ChannelTransportDescriptor,
  CreateGroupRequest,
  DeleteMessagesRequest,
  ListChannelsRequest,
  ListChannelMembersRequest,
  ListSavedMessagesRequest,
  LoadMessagesRequest,
  ModifyMessageRequest,
  PinMessageRequest,
  PinnedMessage,
  SavedMessage,
  SavedMessagePage,
  SaveMessageRequest,
  QuickCommentRequest,
  RevokeMessageRequest,
  MessagePage,
  MessageReceiptDetails,
  Message,
  MessageRef,
  MessageSearchPage,
  SendMessageRequest,
  SendMessageResult,
  SearchMessagesRequest,
  ReplyMessageRequest,
  ForwardMessageRequest,
  ForwardMessageResult,
  GroupMemberMuteRequest,
  GroupMemberRoleRequest,
  GroupMembersRequest,
  UpdateGroupRequest,
} from '../../src/features/channels/contracts'
import { ChannelTransportError } from '../../src/features/channels/contracts'
import {
  YunxinWebChannelTransport,
  type YunxinSdkFactory,
} from '../../src/infrastructure/channels/YunxinWebChannelTransport'
import type { ManagedImCredentials } from './managedWorkspace'
import { createNodeYunxinSdkFactory } from './yunxinNode'
import type { ChannelAttachment } from '../../src/features/channels/contracts'
import type { MessageAttachmentResolver } from '../../src/infrastructure/channels/YunxinWebChannelTransport'
import type { ChannelMediaSource } from '../../src/infrastructure/channels/channelMediaSource'

export type ChannelEventEmitter = (event: ChannelEvent) => void

export class ElectronChannelService {
  private readonly transport: YunxinWebChannelTransport

  constructor(
    getCredentials: () => Promise<ManagedImCredentials>,
    private readonly emitEvent: ChannelEventEmitter,
    factory: YunxinSdkFactory = createNodeYunxinSdkFactory(),
    private readonly attachments?: MessageAttachmentResolver & {
      select(): Promise<ChannelAttachment[]>
      release(token: string): void | Promise<void>
    },
    contactDirectory?: ChannelContactDirectory,
  ) {
    this.transport = new YunxinWebChannelTransport(
      { load: getCredentials },
      factory,
      attachments,
      contactDirectory,
    )
    this.transport.subscribe((event) => this.emitEvent(event))
  }

  descriptor(): ChannelTransportDescriptor {
    return this.transport.descriptor()
  }

  status(): ChannelStatus {
    return this.transport.status()
  }

  async connect(): Promise<ChannelStatus> {
    await this.transport.connect()
    return this.status()
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect()
  }

  async listChannels(request: ListChannelsRequest): Promise<ChannelPage> {
    return this.transport.listChannels(request)
  }

  async getChannelDetails(channelRef: string): Promise<ChannelDetails> {
    return this.transport.getChannelDetails(channelRef)
  }

  async listChannelMembers(request: ListChannelMembersRequest): Promise<ChannelMemberPage> {
    return this.transport.listChannelMembers(request)
  }

  async createGroup(request: CreateGroupRequest): Promise<Channel> {
    return this.transport.createGroup(request)
  }

  async updateGroup(request: UpdateGroupRequest): Promise<void> {
    await this.transport.updateGroup(request)
  }

  async inviteGroupMembers(request: GroupMembersRequest): Promise<{ failedAccountIds: string[] }> {
    return this.transport.inviteGroupMembers(request)
  }

  async removeGroupMembers(request: GroupMembersRequest): Promise<void> {
    await this.transport.removeGroupMembers(request)
  }

  async leaveGroup(channelRef: string): Promise<void> {
    await this.transport.leaveGroup(channelRef)
  }

  async dismissGroup(channelRef: string): Promise<void> {
    await this.transport.dismissGroup(channelRef)
  }

  async setGroupMemberRole(request: GroupMemberRoleRequest): Promise<void> {
    await this.transport.setGroupMemberRole(request)
  }

  async setGroupMemberMute(request: GroupMemberMuteRequest): Promise<void> {
    await this.transport.setGroupMemberMute(request)
  }

  async loadMessages(request: LoadMessagesRequest): Promise<MessagePage> {
    return this.transport.loadMessages(request)
  }

  async searchMessages(request: SearchMessagesRequest): Promise<MessageSearchPage> {
    return this.transport.searchMessages(request)
  }

  async listPinnedMessages(channelRef: string): Promise<PinnedMessage[]> {
    return this.transport.listPinnedMessages(channelRef)
  }

  async saveMessage(request: SaveMessageRequest): Promise<SavedMessage> {
    return this.transport.saveMessage(request)
  }

  async listSavedMessages(request: ListSavedMessagesRequest): Promise<SavedMessagePage> {
    return this.transport.listSavedMessages(request)
  }

  async removeSavedMessage(savedMessageId: string): Promise<void> {
    await this.transport.removeSavedMessage(savedMessageId)
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    return this.transport.sendMessage(request)
  }

  async replyMessage(request: ReplyMessageRequest): Promise<SendMessageResult> {
    return this.transport.replyMessage(request)
  }

  async cancelMessageSend(operationId: string): Promise<void> {
    await this.transport.cancelMessageSend(operationId)
  }

  async releaseAttachment(token: string): Promise<void> {
    const value = token.trim()
    if (!value || value.length > 256 || value.includes('\0'))
      throw new ChannelTransportError('invalidRequest', false)
    await this.attachments?.release(value)
  }

  async forwardMessage(request: ForwardMessageRequest): Promise<ForwardMessageResult> {
    return this.transport.forwardMessage(request)
  }

  async loadMergedMessages(
    messageRef: ForwardMessageRequest['messageRefs'][number],
  ): Promise<Message[]> {
    return this.transport.loadMergedMessages(messageRef)
  }

  async modifyMessage(request: ModifyMessageRequest): Promise<void> {
    await this.transport.modifyMessage(request)
  }

  async deleteMessages(request: DeleteMessagesRequest): Promise<void> {
    await this.transport.deleteMessages(request)
  }

  async revokeMessage(request: RevokeMessageRequest): Promise<void> {
    await this.transport.revokeMessage(request)
  }

  async pinMessage(request: PinMessageRequest): Promise<void> {
    await this.transport.pinMessage(request)
  }

  async quickComment(request: QuickCommentRequest): Promise<void> {
    await this.transport.quickComment(request)
  }

  async transcribeVoice(messageRef: MessageRef): Promise<string> {
    return this.transport.transcribeVoice(messageRef)
  }

  resolveMediaSource(messageRef: MessageRef): ChannelMediaSource {
    return this.transport.resolveMediaSource(messageRef)
  }

  async getMessageReceiptDetails(messageRef: MessageRef): Promise<MessageReceiptDetails> {
    return this.transport.getMessageReceiptDetails(messageRef)
  }

  async markRead(channelRef: string): Promise<void> {
    await this.transport.markRead(channelRef)
  }

  async setPresenceSubscriptions(accountIds: string[]): Promise<void> {
    await this.transport.setPresenceSubscriptions(accountIds)
  }

  async setChannelPinned(channelRef: string, pinned: boolean): Promise<void> {
    await this.transport.setChannelPinned(channelRef, pinned)
  }

  async setChannelMuted(channelRef: string, muted: boolean): Promise<void> {
    await this.transport.setChannelMuted(channelRef, muted)
  }

  async hideChannel(channelRef: string): Promise<void> {
    await this.transport.hideChannel(channelRef)
  }

  async openDirectConversation(accountId: string): Promise<string> {
    return this.transport.openDirectConversation(accountId)
  }

  async selectAttachments(): Promise<ChannelAttachment[]> {
    if (!this.attachments) return []
    return this.attachments.select()
  }

  async selfProfile() {
    return this.transport.getSelfProfile()
  }

  async userProfiles(accountIds: string[]): Promise<ChannelUserProfile[]> {
    return this.transport.getUserProfiles(accountIds)
  }

  async dispose(): Promise<void> {
    await this.transport.dispose()
    const attachments = this.attachments
    if (attachments && 'dispose' in attachments && typeof attachments.dispose === 'function')
      attachments.dispose()
  }
}
