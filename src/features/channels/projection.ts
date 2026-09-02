import type {
  Channel,
  ChannelEvent,
  ChannelRef,
  Message,
  MessagePage,
  MessageRef,
} from './contracts'
import { redactMessageContent } from './messageContent'

export const DEFAULT_MESSAGE_LIMIT = 500

export interface ChannelProjection {
  channels: Map<ChannelRef, Channel>
  messagesByChannel: Map<ChannelRef, Message[]>
  lastEventSequence: number
  totalUnreadCount: number
}

export function createChannelProjection(): ChannelProjection {
  return {
    channels: new Map(),
    messagesByChannel: new Map(),
    lastEventSequence: 0,
    totalUnreadCount: 0,
  }
}

export function replaceChannels(projection: ChannelProjection, channels: Channel[]): void {
  projection.channels = new Map(channels.map((channel) => [channel.ref, channel]))
  for (const channelRef of projection.messagesByChannel.keys()) {
    if (!projection.channels.has(channelRef)) projection.messagesByChannel.delete(channelRef)
  }
}

export function mergeMessagePage(
  projection: ChannelProjection,
  page: MessagePage,
  limit = DEFAULT_MESSAGE_LIMIT,
): void {
  const current = projection.messagesByChannel.get(page.channelRef) ?? []
  projection.messagesByChannel.set(page.channelRef, mergeMessages(current, page.items, limit))
}

export function reduceChannelEvent(
  projection: ChannelProjection,
  event: ChannelEvent,
  limit = DEFAULT_MESSAGE_LIMIT,
): boolean {
  if (event.sequence <= projection.lastEventSequence) return false
  projection.lastEventSequence = event.sequence

  switch (event.type) {
    case 'channel.upserted':
      for (const channel of event.channels) projection.channels.set(channel.ref, channel)
      break
    case 'channel.deleted':
      for (const channelRef of event.channelRefs) {
        projection.channels.delete(channelRef)
        projection.messagesByChannel.delete(channelRef)
      }
      break
    case 'channel.totalUnreadChanged':
      projection.totalUnreadCount = event.total
      break
    case 'message.upserted':
      for (const messages of groupByChannel(event.messages).values()) {
        const channelRef = messages[0]!.ref.channelRef
        const current = projection.messagesByChannel.get(channelRef) ?? []
        projection.messagesByChannel.set(channelRef, mergeMessages(current, messages, limit))
      }
      break
    case 'message.deleted':
      removeMessages(projection, event.refs)
      break
    case 'message.revoked':
      updateMessages(projection, event.refs, (message) => ({
        ...message,
        state: 'revoked',
        text: '',
        content: redactMessageContent(),
      }))
      break
    case 'message.historyCleared': {
      const messages = projection.messagesByChannel.get(event.channelRef) ?? []
      projection.messagesByChannel.set(
        event.channelRef,
        event.before === undefined
          ? []
          : messages.filter((message) => message.sentAt > event.before!),
      )
      break
    }
    case 'message.pinChanged':
      updateMessages(projection, [event.ref], (message) => ({ ...message, pinned: event.pinned }))
      break
    case 'message.reactionsChanged':
      updateMessages(projection, [event.ref], (message) => ({
        ...message,
        reactions: event.reactions,
      }))
      break
    case 'message.receiptChanged':
      updateMessages(projection, [event.ref], (message) => ({ ...message, receipt: event.receipt }))
      break
  }
  return true
}

export function mergeMessages(current: Message[], incoming: Message[], limit: number): Message[] {
  const merged: Message[] = []
  for (const message of [...current, ...incoming]) {
    const index = merged.findIndex((candidate) => sameMessage(candidate.ref, message.ref))
    if (index >= 0) merged[index] = message
    else merged.push(message)
  }
  merged.sort(
    (left, right) =>
      left.sentAt - right.sentAt ||
      left.ref.messageClientId.localeCompare(right.ref.messageClientId),
  )
  return merged.slice(Math.max(0, merged.length - limit))
}

export function sameMessage(left: MessageRef, right: MessageRef): boolean {
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

function groupByChannel(messages: Message[]): Map<ChannelRef, Message[]> {
  const grouped = new Map<ChannelRef, Message[]>()
  for (const message of messages) {
    const values = grouped.get(message.ref.channelRef) ?? []
    values.push(message)
    grouped.set(message.ref.channelRef, values)
  }
  return grouped
}

function removeMessages(projection: ChannelProjection, refs: MessageRef[]): void {
  for (const [channelRef, messages] of projection.messagesByChannel) {
    projection.messagesByChannel.set(
      channelRef,
      messages.filter((message) => !refs.some((ref) => sameMessage(message.ref, ref))),
    )
  }
}

function updateMessages(
  projection: ChannelProjection,
  refs: MessageRef[],
  update: (message: Message) => Message,
): void {
  for (const [channelRef, messages] of projection.messagesByChannel) {
    projection.messagesByChannel.set(
      channelRef,
      messages.map((message) =>
        refs.some((ref) => sameMessage(message.ref, ref)) ? update(message) : message,
      ),
    )
  }
}
