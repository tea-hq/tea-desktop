import type { Channel, JsonValue, Message, MessageRef } from '@/features/channels/contracts'
import type { V2NIMConversation } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMConversationService'
import type {
  V2NIMMessage,
  V2NIMMessageRefer,
} from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'

const MAX_EXTENSION_LENGTH = 4_096
const MAX_JSON_DEPTH = 5

export function mapYunxinConversation(value: V2NIMConversation, targetId?: string): Channel | null {
  if (value.type !== 1 && value.type !== 2) return null
  const preview = value.lastMessage?.text?.slice(0, 500)
  const avatarUrl = boundedRemoteUrl(value.avatar)
  return {
    ref: value.conversationId,
    kind: value.type === 1 ? 'direct' : 'group',
    name: boundedText(value.name?.trim() || targetId?.trim() || value.conversationId, 200),
    ...(value.type === 1 && targetId?.trim() ? { participantAccountId: targetId.trim() } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    description: preview ?? '',
    unreadCount: Math.max(0, value.unreadCount),
    updatedAt: value.updateTime || value.sortOrder || value.createTime,
    lastMessagePreview: preview,
    lastReadAt: value.lastReadTime || undefined,
  }
}

export function mapYunxinMessage(value: V2NIMMessage, currentAccount: string): Message | null {
  if (value.messageType !== 0 || value.isDelete || !value.conversationId || !value.messageClientId)
    return null
  return {
    ref: mapYunxinMessageRef(value),
    sender: {
      id: value.senderId,
      name: boundedText(value.senderId || 'unknown', 200),
      isCurrentUser: value.isSelf || value.senderId === currentAccount,
    },
    sentAt: value.createTime,
    text: boundedText(value.text ?? '', 8_000),
    state: 'active',
    sentByCurrentUser: value.isSelf || value.senderId === currentAccount,
    serverExtension: parseBoundedJson(value.serverExtension),
    pinned: false,
    reactions: [],
  }
}

export function mapYunxinMessageRef(
  value: Pick<V2NIMMessage, 'conversationId' | 'messageClientId' | 'messageServerId'>,
): MessageRef {
  return {
    channelRef: value.conversationId,
    messageClientId: value.messageClientId,
    messageServerId: value.messageServerId || undefined,
  }
}

export function mapYunxinRefer(value: V2NIMMessageRefer): MessageRef {
  return {
    channelRef: value.conversationId,
    messageClientId: value.messageClientId,
    messageServerId: value.messageServerId || undefined,
  }
}

export function serializeServerExtension(value: JsonValue | undefined): string | undefined {
  if (value === undefined) return undefined
  assertJsonDepth(value, 0)
  const serialized = JSON.stringify(value)
  if (serialized.length > MAX_EXTENSION_LENGTH) throw new Error('serverExtensionTooLarge')
  return serialized
}

function parseBoundedJson(value: string | undefined): JsonValue | undefined {
  if (!value || value.length > MAX_EXTENSION_LENGTH) return undefined
  try {
    const parsed = JSON.parse(value) as JsonValue
    assertJsonDepth(parsed, 0)
    return parsed
  } catch {
    return undefined
  }
}

function assertJsonDepth(value: JsonValue, depth: number): void {
  if (depth > MAX_JSON_DEPTH) throw new Error('serverExtensionTooDeep')
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error('serverExtensionTooLarge')
    value.forEach((item) => assertJsonDepth(item, depth + 1))
  } else if (value !== null && typeof value === 'object') {
    const values = Object.values(value)
    if (values.length > 100) throw new Error('serverExtensionTooLarge')
    values.forEach((item) => assertJsonDepth(item, depth + 1))
  }
}

function boundedText(value: string, maximum: number): string {
  return value.slice(0, maximum)
}

function boundedRemoteUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}
