import type { ElectronChannelService } from '../services/channel'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import { readArray, readBoolean, readRecord, readString } from './commandValidation'

export interface ChannelCommandServices {
  channel: ElectronChannelService
}

export function createChannelCommandHandlers(
  services: ChannelCommandServices,
): DesktopCommandHandlerGroup {
  const channel = services.channel

  return defineCommandHandlers('channel', {
    get_channel_descriptor: () => channel.descriptor(),
    get_channel_status: () => channel.status(),
    get_channel_self_profile: () => channel.selfProfile(),
    get_channel_user_profiles: (args) => channel.userProfiles(readAccountIds(args.accountIds)),
    get_channel_user_profiles: (args) => channel.userProfiles(readAccountIds(args.accountIds)),
    open_direct_conversation: (args) =>
      channel.openDirectConversation(readString(args.accountId, 'accountId')),
    reconnect_channel: () => channel.connect(),
    disconnect_channel: () => channel.disconnect(),
    list_channels: (args) => channel.listChannels(readRecord(args.request) as never),
    get_channel_details: (args) =>
      channel.getChannelDetails(readString(args.channelRef, 'channelRef')),
    list_channel_members: (args) => channel.listChannelMembers(readRecord(args.request) as never),
    create_channel_group: (args) => channel.createGroup(readRecord(args.request) as never),
    update_channel_group: (args) => channel.updateGroup(readRecord(args.request) as never),
    invite_channel_group_members: (args) =>
      channel.inviteGroupMembers(readRecord(args.request) as never),
    remove_channel_group_members: (args) =>
      channel.removeGroupMembers(readRecord(args.request) as never),
    leave_channel_group: (args) => channel.leaveGroup(readString(args.channelRef, 'channelRef')),
    dismiss_channel_group: (args) =>
      channel.dismissGroup(readString(args.channelRef, 'channelRef')),
    set_channel_group_member_role: (args) =>
      channel.setGroupMemberRole(readRecord(args.request) as never),
    set_channel_group_member_mute: (args) =>
      channel.setGroupMemberMute(readRecord(args.request) as never),
    load_channel_messages: (args) => channel.loadMessages(readRecord(args.request) as never),
    search_channel_messages: (args) => channel.searchMessages(readRecord(args.request) as never),
    list_pinned_channel_messages: (args) =>
      channel.listPinnedMessages(readString(args.channelRef, 'channelRef')),
    save_channel_message: (args) => channel.saveMessage(readRecord(args.request) as never),
    list_saved_channel_messages: (args) =>
      channel.listSavedMessages(readRecord(args.request) as never),
    remove_saved_channel_message: (args) =>
      channel.removeSavedMessage(readString(args.savedMessageId, 'savedMessageId')),
    send_channel_message: (args) => channel.sendMessage(readRecord(args.request) as never),
    reply_channel_message: (args) => channel.replyMessage(readRecord(args.request) as never),
    forward_channel_message: (args) => channel.forwardMessage(readRecord(args.request) as never),
    load_merged_channel_messages: (args) =>
      channel.loadMergedMessages(readRecord(args.messageRef) as never),
    modify_channel_message: (args) => channel.modifyMessage(readRecord(args.request) as never),
    delete_channel_messages: (args) => channel.deleteMessages(readRecord(args.request) as never),
    revoke_channel_message: (args) => channel.revokeMessage(readRecord(args.request) as never),
    pin_channel_message: (args) => channel.pinMessage(readRecord(args.request) as never),
    quick_comment_channel_message: (args) =>
      channel.quickComment(readRecord(args.request) as never),
    get_channel_message_receipt_details: (args) =>
      channel.getMessageReceiptDetails(readRecord(args.messageRef) as never),
    cancel_channel_message_send: (args) =>
      channel.cancelMessageSend(readString(args.operationId, 'operationId')),
    select_channel_attachments: () => channel.selectAttachments(),
    release_channel_attachment: (args) =>
      channel.releaseAttachment(readString(args.token, 'token')),
    mark_channel_read: (args) => channel.markRead(readString(args.channelRef, 'channelRef')),
    set_channel_pinned: (args) =>
      channel.setChannelPinned(
        readString(args.channelRef, 'channelRef'),
        readBoolean(args.pinned, 'pinned'),
      ),
    set_channel_muted: (args) =>
      channel.setChannelMuted(
        readString(args.channelRef, 'channelRef'),
        readBoolean(args.muted, 'muted'),
      ),
    hide_channel: (args) => channel.hideChannel(readString(args.channelRef, 'channelRef')),
  } satisfies Partial<DesktopCommandHandlers>)
}

function readAccountIds(value: unknown): string[] {
  const values = readArray(value, 'accountIds')
  if (
    values.length === 0 ||
    values.length > 100 ||
    values.some((item) => typeof item !== 'string' || !item.trim() || item.length > 128)
  ) {
    throw { code: 'invalidRequest', retryable: false }
  }
  return values.map((item) => (item as string).trim())
}
