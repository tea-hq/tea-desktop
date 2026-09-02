import type { MessageContent, OutgoingMessageContent } from './contracts'

const MEDIA_LABELS = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'file',
} as const

/**
 * Produces a bounded, provider-independent textual projection. The visual
 * message renderer can use the structured content while older previews and
 * Agent source records use this safe fallback.
 */
export function messageContentToText(content: MessageContent): string {
  switch (content.kind) {
    case 'text':
    case 'robot':
    case 'tips':
      return content.text
    case 'call':
      return content.text || '[call]'
    case 'custom':
      return content.text || '[custom message]'
    case 'merged':
      return (
        content.abstracts
          .map((item) => `${item.senderName}: ${item.text}`)
          .filter(Boolean)
          .join('\n') ||
        content.sourceChannelName ||
        '[chat history]'
      )
    case 'location':
      return content.address ? `[location: ${content.address}]` : '[location]'
    case 'notification':
      return '[notification]'
    case 'avchat':
      return content.text || '[audio/video call]'
    case 'unknown':
      return content.text || `[message:${content.providerType}]`
    case 'redacted':
      return ''
    case 'image':
    case 'audio':
    case 'video':
    case 'file': {
      const label = MEDIA_LABELS[content.kind]
      const name = content.media.name?.trim()
      return content.caption?.trim() || (name ? `[${label}: ${name}]` : `[${label}]`)
    }
  }
}

export function createTextMessageContent(text: string): Extract<MessageContent, { kind: 'text' }> {
  return { kind: 'text', text }
}

/** Convert an outgoing draft into the durable provider-neutral projection. */
export function outgoingContentToMessageContent(content: OutgoingMessageContent): MessageContent {
  switch (content.kind) {
    case 'text':
      return createTextMessageContent(content.text)
    case 'image':
    case 'audio':
    case 'video':
    case 'file':
      return {
        kind: content.kind,
        ...(content.caption ? { caption: content.caption } : {}),
        media: {
          ...(content.media.name ? { name: content.media.name } : {}),
          ...(content.media.mimeType ? { mimeType: content.media.mimeType } : {}),
          ...(content.media.width !== undefined ? { width: content.media.width } : {}),
          ...(content.media.height !== undefined ? { height: content.media.height } : {}),
          ...(content.media.durationMs !== undefined
            ? { durationMs: content.media.durationMs }
            : {}),
        },
      }
    case 'location':
      return {
        kind: 'location',
        latitude: content.latitude,
        longitude: content.longitude,
        address: content.address,
      }
    case 'custom':
      return {
        kind: 'custom',
        subtype: content.subtype,
        text: content.text,
        ...(content.raw ? { raw: content.raw } : {}),
        ...(content.data !== undefined ? { data: content.data } : {}),
      }
    case 'call':
      return {
        kind: 'call',
        callType: content.callType,
        channelId: content.channelId,
        status: content.status,
        durations: content.durations,
        text: content.text,
      }
    case 'tips':
      return { kind: 'tips', text: content.text }
  }
}

export function redactMessageContent(): MessageContent {
  return { kind: 'redacted', reason: 'revoked' }
}
