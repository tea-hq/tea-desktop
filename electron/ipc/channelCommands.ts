import type { ElectronChannelService } from '../services/channel'
import type { ChannelMediaSaveService } from '../services/channelMedia'
import type { ChannelMediaSaveRequest, MessageRef } from '../../src/features/channels/contracts'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import { readArray, readBoolean, readRecord, readString } from './commandValidation'
import { debugQuickComment } from '../services/quickCommentDebug'

export interface ChannelCommandServices {
  channel: ElectronChannelService
  channelMedia: ChannelMediaSaveService
}

export function createChannelCommandHandlers(
  services: ChannelCommandServices,
): DesktopCommandHandlerGroup {
  const channel = services.channel
  const channelMedia = services.channelMedia

  return defineCommandHandlers('channel', {
    get_channel_descriptor: () => channel.descriptor(),
    get_channel_status: () => channel.status(),
    get_channel_self_profile: () => channel.selfProfile(),
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
    quick_comment_channel_message: async (args) => {
      const request = readRecord(args.request) as never
      debugQuickComment('electron-ipc.command', {
        command: 'quick_comment_channel_message',
        request,
      })
      try {
        await channel.quickComment(request)
        debugQuickComment('electron-ipc.success', {
          command: 'quick_comment_channel_message',
          request,
        })
      } catch (error) {
        debugQuickComment('electron-ipc.failure', {
          command: 'quick_comment_channel_message',
          request,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
    transcribe_channel_voice: async (args) =>
      readVoiceTranscript(await channel.transcribeVoice(readMessageRef(args.messageRef))),
    get_channel_message_receipt_details: (args) =>
      channel.getMessageReceiptDetails(readRecord(args.messageRef) as never),
    load_channel_thread: (args) => channel.loadThread(readMessageRef(args.messageRef)),
    cancel_channel_message_send: (args) =>
      channel.cancelMessageSend(readString(args.operationId, 'operationId')),
    select_channel_attachments: () => channel.selectAttachments(),
    release_channel_attachment: (args) =>
      channel.releaseAttachment(readString(args.token, 'token')),
    save_channel_media: (args) => channelMedia.save(readMediaSaveRequest(args.request)),
    cancel_channel_media_save: (args) =>
      channelMedia.cancel(readMediaOperationId(args.operationId)),
    mark_channel_read: (args) => channel.markRead(readString(args.channelRef, 'channelRef')),
    set_channel_presence_subscriptions: (args) =>
      channel.setPresenceSubscriptions(readPresenceAccountIds(args.accountIds)),
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

function readMessageRef(value: unknown): MessageRef {
  const record = readRecord(value)
  const channelRef = readMessageRefPart(record.channelRef, 'channelRef')
  const messageClientId = readMessageRefPart(record.messageClientId, 'messageClientId')
  const messageServerId =
    record.messageServerId === undefined
      ? undefined
      : readMessageRefPart(record.messageServerId, 'messageServerId')
  return { channelRef, messageClientId, ...(messageServerId ? { messageServerId } : {}) }
}

function readMediaSaveRequest(value: unknown): ChannelMediaSaveRequest {
  const record = readRecord(value)
  return {
    operationId: readMediaOperationId(record.operationId),
    messageRef: readMessageRef(record.messageRef),
  }
}

function readMediaOperationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value))
    throw {
      code: 'invalidRequest',
      retryable: false,
      message: 'operationId must be a bounded identifier',
    }
  return value
}

function readMessageRefPart(value: unknown, name: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw {
      code: 'invalidRequest',
      retryable: false,
      message: `${name} must be a bounded string`,
    }
  return value
}

function readVoiceTranscript(value: unknown): string {
  if (typeof value !== 'string') throw invalidVoiceTranscript()
  const transcript = value.trim()
  if (!transcript || transcript.length > 32_768) throw invalidVoiceTranscript()
  return transcript
}

function invalidVoiceTranscript() {
  return {
    code: 'protocolFailure',
    retryable: false,
    message: 'voice transcript is invalid',
  }
}

function readPresenceAccountIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 3_000) throw invalidPresenceAccountIds()
  return value.map((candidate) => {
    if (typeof candidate !== 'string') throw invalidPresenceAccountIds()
    const accountId = candidate.trim()
    if (!accountId || accountId.length > 512 || /[\u0000-\u001f\u007f]/.test(accountId))
      throw invalidPresenceAccountIds()
    return accountId
  })
}

function invalidPresenceAccountIds() {
  return {
    code: 'invalidRequest',
    retryable: false,
    message: 'accountIds must be a bounded string array',
  }
}
