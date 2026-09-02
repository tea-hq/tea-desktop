import type { Message } from '@/features/channels/contracts'
import type { ChannelSourceInput } from '@/types/channelCollaboration'
import { messageContentToText } from '@/features/channels/messageContent'

const MAX_SOURCE_TEXT_CHARS = 4_000

export function messageToChannelSource(
  message: Message,
  capturedAt = Date.now(),
): ChannelSourceInput {
  return {
    messageRef: { ...message.ref },
    senderName: message.sender.name.trim().slice(0, 128),
    sentAt: message.sentAt,
    sentByCurrentUser: message.sentByCurrentUser,
    text:
      message.state === 'revoked'
        ? ''
        : messageContentToText(message.content).trim().slice(0, MAX_SOURCE_TEXT_CHARS),
    capturedAt,
    state: message.state,
  }
}

export function sameSource(left: ChannelSourceInput, right: ChannelSourceInput): boolean {
  return (
    left.messageRef.channelRef === right.messageRef.channelRef &&
    left.messageRef.messageClientId === right.messageRef.messageClientId &&
    (left.messageRef.messageServerId === undefined ||
      right.messageRef.messageServerId === undefined ||
      left.messageRef.messageServerId === right.messageRef.messageServerId)
  )
}
