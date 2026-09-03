import { invoke, listen, type UnlistenFn } from '../electronBridge'
import type { DesktopCommand } from '@/types/electronBridge'

import type {
  ChannelCapability,
  Channel,
  ChannelDetails,
  ChannelMemberPage,
  ChannelEventListener,
  ChannelPage,
  ChannelRef,
  ChannelSelfProfile,
  ChannelUserProfile,
  ChannelStatus,
  CreateGroupRequest,
  ChannelTransport,
  ChannelTransportDescriptor,
  ListChannelsRequest,
  ListChannelMembersRequest,
  ListSavedMessagesRequest,
  LoadMessagesRequest,
  Message,
  MessageRef,
  MessageReceiptDetails,
  ChannelThread,
  MessageSearchPage,
  ModifyMessageRequest,
  DeleteMessagesRequest,
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
  RevokeMessageRequest,
  MessagePage,
  SendMessageRequest,
  SendMessageResult,
  SearchMessagesRequest,
  UpdateGroupRequest,
} from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'
import { debugQuickComment } from '@/features/channels/quickCommentDebug'

const descriptor: ChannelTransportDescriptor = {
  id: 'yunxin.web',
  displayName: 'Yunxin',
  protocolVersion: 1,
  capabilities: [
    'channel.list',
    'profile.self',
    'channel.details',
    'channel.members',
    'channel.manage',
    'channel.pin',
    'channel.mute',
    'channel.hide',
    'presence.subscribe',
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
    'message.voice.transcribe',
    'channel.read',
    'message.modify.events',
    'message.delete.events',
    'message.revoke.events',
    'message.pin.events',
    'message.receipt.events',
    'message.receipt.details',
    'message.thread',
  ].map((id) => ({ id: id as ChannelCapability['id'], available: true })),
}

export class ElectronChannelTransport implements ChannelTransport {
  private currentStatus: ChannelStatus = { phase: 'disconnected', retryable: false }
  private listeners = new Set<ChannelEventListener>()
  private unlisten: Promise<UnlistenFn> | null = null
  private disposed = false

  descriptor(): ChannelTransportDescriptor {
    return structuredClone(descriptor)
  }
  capabilities(): ChannelCapability[] {
    return structuredClone(descriptor.capabilities)
  }
  status(): ChannelStatus {
    return structuredClone(this.currentStatus)
  }

  async getSelfProfile(): Promise<ChannelSelfProfile> {
    this.assertUsable()
    return this.command('get_channel_self_profile', {})
  }

  async getUserProfiles(accountIds: string[]): Promise<ChannelUserProfile[]> {
    this.assertUsable()
    return this.command('get_channel_user_profiles', { accountIds })
  }

  async connect(): Promise<void> {
    this.assertUsable()
    this.ensureListening()
    try {
      const current = await invoke<ChannelStatus>('get_channel_status')
      this.currentStatus =
        current.phase === 'connected' ? current : await invoke<ChannelStatus>('reconnect_channel')
    } catch (error) {
      throw mapCommandError(error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.disposed) return
    try {
      await invoke('disconnect_channel')
      this.currentStatus = { phase: 'disconnected', retryable: false }
    } catch (error) {
      throw mapCommandError(error)
    }
  }

  async listChannels(request: ListChannelsRequest): Promise<ChannelPage> {
    return this.command('list_channels', { request })
  }

  async getChannelDetails(channelRef: ChannelRef): Promise<ChannelDetails> {
    return this.command('get_channel_details', { channelRef })
  }

  async listChannelMembers(request: ListChannelMembersRequest): Promise<ChannelMemberPage> {
    return this.command('list_channel_members', { request })
  }

  async createGroup(request: CreateGroupRequest): Promise<Channel> {
    return this.command('create_channel_group', { request })
  }

  async updateGroup(request: UpdateGroupRequest): Promise<void> {
    await this.command('update_channel_group', { request })
  }

  async inviteGroupMembers(request: GroupMembersRequest): Promise<{ failedAccountIds: string[] }> {
    return this.command('invite_channel_group_members', { request })
  }

  async removeGroupMembers(request: GroupMembersRequest): Promise<void> {
    await this.command('remove_channel_group_members', { request })
  }

  async leaveGroup(channelRef: ChannelRef): Promise<void> {
    await this.command('leave_channel_group', { channelRef })
  }

  async dismissGroup(channelRef: ChannelRef): Promise<void> {
    await this.command('dismiss_channel_group', { channelRef })
  }

  async setGroupMemberRole(request: GroupMemberRoleRequest): Promise<void> {
    await this.command('set_channel_group_member_role', { request })
  }

  async setGroupMemberMute(request: GroupMemberMuteRequest): Promise<void> {
    await this.command('set_channel_group_member_mute', { request })
  }

  async loadMessages(request: LoadMessagesRequest): Promise<MessagePage> {
    return this.command('load_channel_messages', { request })
  }

  async searchMessages(request: SearchMessagesRequest): Promise<MessageSearchPage> {
    return this.command('search_channel_messages', { request })
  }

  async listPinnedMessages(channelRef: ChannelRef): Promise<PinnedMessage[]> {
    return this.command('list_pinned_channel_messages', { channelRef })
  }

  async saveMessage(request: SaveMessageRequest): Promise<SavedMessage> {
    return this.command('save_channel_message', { request })
  }

  async listSavedMessages(request: ListSavedMessagesRequest): Promise<SavedMessagePage> {
    return this.command('list_saved_channel_messages', { request })
  }

  async removeSavedMessage(savedMessageId: string): Promise<void> {
    await this.command('remove_saved_channel_message', { savedMessageId })
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    return this.command('send_channel_message', { request })
  }

  async replyMessage(request: ReplyMessageRequest): Promise<SendMessageResult> {
    return this.command('reply_channel_message', { request })
  }

  async cancelMessageSend(operationId: string): Promise<void> {
    await this.command('cancel_channel_message_send', { operationId })
  }

  async forwardMessage(request: ForwardMessageRequest): Promise<ForwardMessageResult> {
    return this.command('forward_channel_message', { request })
  }

  async loadMergedMessages(messageRef: MessageRef): Promise<Message[]> {
    return this.command('load_merged_channel_messages', { messageRef })
  }

  async modifyMessage(request: ModifyMessageRequest): Promise<void> {
    await this.command('modify_channel_message', { request })
  }

  async deleteMessages(request: DeleteMessagesRequest): Promise<void> {
    await this.command('delete_channel_messages', { request })
  }

  async revokeMessage(request: RevokeMessageRequest): Promise<void> {
    await this.command('revoke_channel_message', { request })
  }

  async pinMessage(request: PinMessageRequest): Promise<void> {
    await this.command('pin_channel_message', { request })
  }

  async quickComment(request: QuickCommentRequest): Promise<void> {
    const ipcRequest: QuickCommentRequest = {
      messageRef: copyMessageRef(request.messageRef),
      type: request.type,
      active: request.active,
    }
    debugQuickComment('electron-renderer.request', {
      command: 'quick_comment_channel_message',
      ref: ipcRequest.messageRef,
      type: ipcRequest.type,
      active: ipcRequest.active,
      status: this.currentStatus,
    })
    try {
      await this.command('quick_comment_channel_message', { request: ipcRequest })
      debugQuickComment('electron-renderer.success', {
        command: 'quick_comment_channel_message',
        ref: ipcRequest.messageRef,
        type: ipcRequest.type,
        active: ipcRequest.active,
      })
    } catch (error) {
      debugQuickComment('electron-renderer.failure', {
        command: 'quick_comment_channel_message',
        ref: ipcRequest.messageRef,
        type: ipcRequest.type,
        active: ipcRequest.active,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async transcribeVoice(messageRef: MessageRef): Promise<string> {
    return this.command('transcribe_channel_voice', { messageRef })
  }

  async getMessageReceiptDetails(messageRef: MessageRef): Promise<MessageReceiptDetails> {
    return this.command('get_channel_message_receipt_details', { messageRef })
  }

  async loadThread(messageRef: MessageRef): Promise<ChannelThread> {
    return this.command('load_channel_thread', { messageRef })
  }

  async openDirectConversation(_accountId: string): Promise<ChannelRef> {
    return this.command('open_direct_conversation', { accountId: _accountId })
  }

  async setChannelPinned(channelRef: ChannelRef, pinned: boolean): Promise<void> {
    await this.command('set_channel_pinned', { channelRef, pinned })
  }

  async setChannelMuted(channelRef: ChannelRef, muted: boolean): Promise<void> {
    await this.command('set_channel_muted', { channelRef, muted })
  }

  async hideChannel(channelRef: ChannelRef): Promise<void> {
    await this.command('hide_channel', { channelRef })
  }

  async markRead(channelRef: ChannelRef): Promise<void> {
    await this.command('mark_channel_read', { channelRef })
  }

  async setPresenceSubscriptions(accountIds: string[]): Promise<void> {
    await this.command('set_channel_presence_subscriptions', { accountIds })
  }

  subscribe(listener: ChannelEventListener): () => void {
    this.assertUsable()
    this.listeners.add(listener)
    this.ensureListening()
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    const unlisten = this.unlisten
    this.unlisten = null
    if (unlisten) (await unlisten)()
    this.currentStatus = { phase: 'disconnected', retryable: false }
  }

  private async command<T>(name: DesktopCommand, args: Record<string, unknown>): Promise<T> {
    this.assertUsable()
    try {
      return await invoke<T>(name, args)
    } catch (error) {
      if (name === 'quick_comment_channel_message')
        debugQuickComment('electron-renderer.command-failure', {
          command: name,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorCode:
            error && typeof error === 'object' && 'code' in error
              ? (error as { code?: unknown }).code
              : undefined,
          retryable:
            error && typeof error === 'object' && 'retryable' in error
              ? (error as { retryable?: unknown }).retryable
              : undefined,
        })
      throw mapCommandError(error)
    }
  }

  private ensureListening(): void {
    if (this.unlisten) return
    this.unlisten = listen('channel-event', (event) => {
      if (this.disposed) return
      if (event.payload.type === 'message.reactionsChanged') {
        debugQuickComment('electron-renderer.event', {
          event: event.payload.type,
          sequence: event.payload.sequence,
          ref: event.payload.ref,
          reactions: event.payload.reactions,
        })
      }
      if (event.payload.type === 'status.changed') this.currentStatus = event.payload.status
      for (const listener of [...this.listeners]) listener(structuredClone(event.payload))
    }).catch(() => () => undefined)
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
  }
}

function copyMessageRef(ref: MessageRef): MessageRef {
  return {
    channelRef: ref.channelRef,
    messageClientId: ref.messageClientId,
    ...(ref.messageServerId === undefined ? {} : { messageServerId: ref.messageServerId }),
  }
}

function mapCommandError(value: unknown): ChannelTransportError {
  const candidate = value as { code?: unknown; retryable?: unknown } | null
  const code =
    candidate && typeof candidate.code === 'string' ? candidate.code : 'transportUnavailable'
  const retryable = candidate?.retryable === true
  switch (code) {
    case 'invalidRequest':
      return new ChannelTransportError('invalidRequest', false)
    case 'notInitialized':
      return new ChannelTransportError('notInitialized', false)
    case 'notConnected':
      return new ChannelTransportError('notConnected', true)
    case 'authenticationFailed':
      return new ChannelTransportError('authentication', false)
    case 'protocolFailure':
      return new ChannelTransportError('protocolFailure', false)
    case 'timeout':
      return new ChannelTransportError('timeout', true)
    default:
      return new ChannelTransportError('transport', retryable)
  }
}
