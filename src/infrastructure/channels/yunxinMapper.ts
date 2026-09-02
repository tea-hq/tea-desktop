import type {
  Channel,
  JsonValue,
  Message,
  MessageCallDuration,
  MessageContent,
  MessageMediaAttachment,
  MessageRef,
} from '@/features/channels/contracts'
import { messageContentToText } from '@/features/channels/messageContent'
import { parseYunxinMentions } from './yunxinMentions'
import type { V2NIMConversation } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMConversationService'
import type {
  V2NIMMessage,
  V2NIMMessageRefer,
} from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'

const MAX_EXTENSION_LENGTH = 4_096
const MAX_JSON_DEPTH = 5

export function mapYunxinConversation(value: V2NIMConversation, targetId?: string): Channel | null {
  if (value.type !== 1 && value.type !== 2) return null
  const preview = value.lastMessage
    ? boundedText(messageContentToText(mapYunxinMessageContent(value.lastMessage)), 500)
    : undefined
  const avatarUrl = boundedRemoteUrl(value.avatar)
  const directAccountId =
    value.type === 1 ? boundedText(targetId?.trim() ?? '', 512) || undefined : undefined
  return {
    ref: value.conversationId,
    kind: value.type === 1 ? 'direct' : 'group',
    ...(directAccountId ? { directAccountId } : {}),
    name: boundedText(value.name?.trim() || targetId?.trim() || value.conversationId, 200),
    ...(value.type === 1 && targetId?.trim() ? { participantAccountId: targetId.trim() } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    description: preview ?? '',
    pinned: value.stickTop,
    muted: value.mute === true,
    unreadCount: Math.max(0, value.unreadCount),
    updatedAt: value.updateTime || value.sortOrder || value.createTime,
    lastMessagePreview: preview,
    lastReadAt: value.lastReadTime || undefined,
  }
}

export function mapYunxinMessage(value: V2NIMMessage, currentAccount: string): Message | null {
  if (value.isDelete || !value.conversationId || !value.messageClientId) return null
  const content = mapYunxinMessageContent(value)
  const text = boundedText(messageContentToText(content), 8_000)
  const mergedSender = mergedSenderMetadata(value.serverExtension)
  const serverExtension = parseBoundedJson(value.serverExtension)
  const mentions = parseYunxinMentions(serverExtension)
  const clientReference = teaClientReference(serverExtension)
  return {
    ref: mapYunxinMessageRef(value),
    sender: {
      id: value.senderId,
      name: mergedSender.name || boundedText(value.senderId || 'unknown', 200),
      ...(mergedSender.avatarUrl ? { avatarUrl: mergedSender.avatarUrl } : {}),
      isCurrentUser: value.isSelf || value.senderId === currentAccount,
    },
    sentAt: value.createTime,
    text,
    content,
    ...(value.threadReply
      ? {
          replyTo: {
            ref: mapYunxinRefer(value.threadReply),
            senderName: boundedText(value.threadReply.senderId || 'unknown', 200),
            text: '',
          },
        }
      : {}),
    state: 'active',
    sentByCurrentUser: value.isSelf || value.senderId === currentAccount,
    serverExtension,
    pinned: false,
    reactions: [],
    ...(mentions.length ? { mentions } : {}),
    ...(clientReference ? { clientReference } : {}),
  }
}

function teaClientReference(extension: JsonValue | undefined): string | undefined {
  if (!extension || typeof extension !== 'object' || Array.isArray(extension)) return undefined
  const delivery = extension.teaDelivery
  if (
    !delivery ||
    typeof delivery !== 'object' ||
    Array.isArray(delivery) ||
    delivery.version !== 1
  )
    return undefined
  const value = delivery.clientReference
  return typeof value === 'string' && value.trim() && value.length <= 128 ? value : undefined
}

interface YunxinMessageContentSource {
  messageType?: number
  subType?: number
  text?: string
  attachment?: unknown
}

/**
 * Converts the SDK's numeric message/attachment union into the renderer and
 * Agent-facing domain model. Keep this function structural so V2NIMMessage,
 * conversation last-message summaries, and a future N-API adapter can all
 * use the same normalization rules without leaking SDK types.
 */
export function mapYunxinMessageContent(value: YunxinMessageContentSource): MessageContent {
  const text = safeText(value.text, 8_000)
  const attachment = asRecord(value.attachment)
  switch (value.messageType) {
    case 0:
      return { kind: 'text', text }
    case 1:
      return {
        kind: 'image',
        ...(caption(text) ? { caption: caption(text) } : {}),
        media: mapMedia(attachment, {
          width: nonNegativeNumber(attachment?.width),
          height: nonNegativeNumber(attachment?.height),
        }),
      }
    case 2:
      return {
        kind: 'audio',
        ...(caption(text) ? { caption: caption(text) } : {}),
        media: mapMedia(attachment, { durationMs: nonNegativeNumber(attachment?.duration) }),
      }
    case 3:
      return {
        kind: 'video',
        ...(caption(text) ? { caption: caption(text) } : {}),
        media: mapMedia(attachment, {
          durationMs: nonNegativeNumber(attachment?.duration),
          width: nonNegativeNumber(attachment?.width),
          height: nonNegativeNumber(attachment?.height),
        }),
      }
    case 4: {
      const latitude = numberValue(attachment?.latitude, -90, 90)
      const longitude = numberValue(attachment?.longitude, -180, 180)
      if (latitude !== undefined && longitude !== undefined) {
        return {
          kind: 'location',
          latitude,
          longitude,
          address: safeText(attachment?.address, 1_024),
        }
      }
      return unknownContent(value, text)
    }
    case 5:
      return {
        kind: 'notification',
        notificationType: numberValue(attachment?.type) ?? -1,
        targetIds: stringArray(attachment?.targetIds, 128, 100),
        ...(typeof attachment?.chatBanned === 'boolean'
          ? { chatBanned: attachment.chatBanned }
          : {}),
        ...parsedData(attachment?.serverExtension),
      }
    case 6:
      return {
        kind: 'file',
        ...(caption(text) ? { caption: caption(text) } : {}),
        media: mapMedia(attachment),
      }
    case 7:
      return text ? { kind: 'avchat', text } : { kind: 'avchat' }
    case 10:
      return { kind: 'tips', text }
    case 11:
      return { kind: 'robot', text, ...parsedData(attachment?.raw) }
    case 12:
      return {
        kind: 'call',
        callType: numberValue(attachment?.type) ?? -1,
        channelId: safeText(attachment?.channelId, 256),
        status: numberValue(attachment?.status) ?? -1,
        durations: callDurations(attachment?.durations),
        text: safeText(attachment?.text ?? value.text, 8_000),
      }
    case 100:
      if (typeof attachment?.raw === 'string') {
        const merged = mapMergedMessageContent(attachment.raw)
        if (merged) return merged
      }
      return {
        kind: 'custom',
        subtype: numberValue(value.subType) ?? 0,
        text,
        ...(typeof attachment?.raw === 'string'
          ? {
              raw: boundedText(attachment.raw, MAX_EXTENSION_LENGTH),
              ...parsedData(attachment.raw),
            }
          : {}),
      }
    default:
      return unknownContent(value, text)
  }
}

function mapMergedMessageContent(raw: string): MessageContent | null {
  const payload = asRecord(parseBoundedJson(raw, 16_384))
  if (numberValue(payload?.type) !== 101) return null
  const data = asRecord(payload?.data)
  const depth = numberValue(data?.depth, 1, 100)
  if (!data || depth === undefined) return null
  const sourceChannelName = safeText(data.sessionName, 200) || safeText(data.sessionId, 200)
  const abstracts = Array.isArray(data.abstracts)
    ? data.abstracts
        .map((value) => {
          const item = asRecord(value)
          const senderAccountId = safeText(item?.userAccId, 128)
          const senderName = safeText(item?.senderNick, 200)
          const text = safeText(item?.content, 500)
          return senderName || text ? { senderAccountId, senderName, text } : null
        })
        .filter((value): value is NonNullable<typeof value> => value !== null)
        .slice(0, 3)
    : []
  return {
    kind: 'merged',
    ...(sourceChannelName ? { sourceChannelName } : {}),
    abstracts,
    depth,
  }
}

function mergedSenderMetadata(value: string | undefined): { name: string; avatarUrl?: string } {
  const extension = asRecord(parseBoundedJson(value))
  const name = safeText(extension?.mergedMessageNickKey, 200)
  const avatarUrl = boundedRemoteUrl(safeText(extension?.mergedMessageAvatarKey, 2_048))
  return { name, ...(avatarUrl ? { avatarUrl } : {}) }
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

function parseBoundedJson(
  value: string | undefined,
  maximumLength = MAX_EXTENSION_LENGTH,
): JsonValue | undefined {
  if (!value || value.length > maximumLength) return undefined
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
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum)
}

function safeText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? boundedText(value, maximum) : ''
}

function caption(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function numberValue(
  value: unknown,
  minimum = -Number.MAX_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined
}

function nonNegativeNumber(value: unknown): number | undefined {
  return numberValue(value, 0)
}

function stringArray(value: unknown, maximumLength: number, maximumItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => boundedText(item, maximumLength))
    .filter(Boolean)
    .slice(0, maximumItems)
}

function mapMedia(
  attachment: Record<string, unknown> | undefined,
  overrides: Partial<MessageMediaAttachment> = {},
): MessageMediaAttachment {
  const media = {
    ...(typeof attachment?.url === 'string' ? { url: boundedRemoteUrl(attachment.url) } : {}),
    ...(typeof attachment?.name === 'string' ? { name: safeText(attachment.name, 512) } : {}),
    ...(nonNegativeNumber(attachment?.size) !== undefined
      ? { size: nonNegativeNumber(attachment?.size) }
      : {}),
    ...(typeof attachment?.ext === 'string' ? { extension: safeText(attachment.ext, 32) } : {}),
    ...overrides,
  }
  return Object.fromEntries(Object.entries(media).filter(([, value]) => value !== undefined))
}

function callDurations(value: unknown): MessageCallDuration[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const record = asRecord(item)
      const accountId = safeText(record?.accountId, 128)
      const durationMs = nonNegativeNumber(record?.duration)
      return accountId && durationMs !== undefined ? { accountId, durationMs } : null
    })
    .filter((item): item is MessageCallDuration => item !== null)
    .slice(0, 100)
}

function parsedData(value: unknown): { data?: JsonValue } {
  return typeof value === 'string'
    ? (() => {
        const data = parseBoundedJson(value)
        return data === undefined ? {} : { data }
      })()
    : {}
}

function unknownContent(value: YunxinMessageContentSource, text: string): MessageContent {
  return {
    kind: 'unknown',
    providerType: numberValue(value.messageType) ?? -1,
    ...(numberValue(value.subType) !== undefined ? { subtype: numberValue(value.subType) } : {}),
    ...(text ? { text } : {}),
  }
}

function boundedRemoteUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}
