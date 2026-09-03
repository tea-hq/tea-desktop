import type { V2NIMMessage } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'

export const YUNXIN_MESSAGE_COLLECTION_TYPE_BASE = 1_000
export const YUNXIN_MESSAGE_COLLECTION_TYPE_MAX = 1_100

const SCHEMA = 'tea.saved-message'
const VERSION = 1
const MAX_PAYLOAD_LENGTH = 128_000
const MAX_SERIALIZED_MESSAGE_LENGTH = 120_000
const MAX_NAME_LENGTH = 512
const MAX_AVATAR_LENGTH = 2_048

export interface YunxinSavedMessagePayload {
  message: string
  sourceChannelName?: string
  senderName?: string
  avatarUrl?: string
}

export function encodeYunxinSavedMessagePayload(payload: YunxinSavedMessagePayload): string {
  const message = boundedRequiredString(payload.message, MAX_SERIALIZED_MESSAGE_LENGTH)
  if (!message) throw new Error('invalidSavedMessagePayload')
  const value = JSON.stringify({
    schema: SCHEMA,
    version: VERSION,
    message,
    conversationName: boundedOptionalString(payload.sourceChannelName, MAX_NAME_LENGTH),
    senderName: boundedOptionalString(payload.senderName, MAX_NAME_LENGTH),
    avatar: boundedOptionalString(payload.avatarUrl, MAX_AVATAR_LENGTH),
  })
  if (value.length > MAX_PAYLOAD_LENGTH) throw new Error('invalidSavedMessagePayload')
  return value
}

export function decodeYunxinSavedMessagePayload(value: string): YunxinSavedMessagePayload | null {
  if (!value || value.length > MAX_PAYLOAD_LENGTH) return null
  try {
    const payload = JSON.parse(value) as Record<string, unknown>
    if (
      (payload.schema !== undefined || payload.version !== undefined) &&
      (payload.schema !== SCHEMA || payload.version !== VERSION)
    )
      return null
    const message = boundedRequiredString(payload.message, MAX_SERIALIZED_MESSAGE_LENGTH)
    if (!message) return null
    const sourceChannelName = boundedOptionalString(payload.conversationName, MAX_NAME_LENGTH)
    const senderName = boundedOptionalString(payload.senderName, MAX_NAME_LENGTH)
    const avatarUrl = boundedOptionalString(payload.avatar, MAX_AVATAR_LENGTH)
    return {
      message,
      ...(sourceChannelName ? { sourceChannelName } : {}),
      ...(senderName ? { senderName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    }
  } catch {
    return null
  }
}

export function yunxinMessageCollectionType(messageType: number): number {
  if (!Number.isInteger(messageType) || messageType < 0 || messageType > 100)
    throw new Error('invalidSavedMessageType')
  return YUNXIN_MESSAGE_COLLECTION_TYPE_BASE + messageType
}

export function isYunxinMessageCollectionType(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= YUNXIN_MESSAGE_COLLECTION_TYPE_BASE &&
    value <= YUNXIN_MESSAGE_COLLECTION_TYPE_MAX
  )
}

export function yunxinSavedMessageUniqueId(
  message: Pick<V2NIMMessage, 'conversationId' | 'messageClientId' | 'messageServerId'>,
): string {
  const serverId = message.messageServerId?.trim()
  if (serverId) return serverId
  const conversationId = message.conversationId.trim()
  const clientId = message.messageClientId.trim()
  if (!conversationId || !clientId) throw new Error('invalidSavedMessageIdentity')
  return `${conversationId}_${clientId}`
}

function boundedRequiredString(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= limit && !normalized.includes('\0') ? normalized : null
}

function boundedOptionalString(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= limit && !normalized.includes('\0')
    ? normalized
    : undefined
}
