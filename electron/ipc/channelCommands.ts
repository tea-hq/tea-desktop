import type { ElectronChannelService } from '../services/channel'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import { readRecord, readString } from './commandValidation'

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
    open_direct_conversation: (args) =>
      channel.openDirectConversation(readString(args.accountId, 'accountId')),
    reconnect_channel: () => channel.connect(),
    disconnect_channel: () => channel.disconnect(),
    list_channels: (args) => channel.listChannels(readRecord(args.request) as never),
    load_channel_messages: (args) => channel.loadMessages(readRecord(args.request) as never),
    send_channel_message: (args) => channel.sendMessage(readRecord(args.request) as never),
    mark_channel_read: (args) => channel.markRead(readString(args.channelRef, 'channelRef')),
  } satisfies Partial<DesktopCommandHandlers>)
}
