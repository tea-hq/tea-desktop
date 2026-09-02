import type { Message, MessageMediaAttachment, MessageRef } from '@/features/channels/contracts'

export interface ChannelMediaSource {
  url: string
  fileName: string
  mimeType?: string
  expectedSize?: number
}

export interface ChannelMediaSourceResolver {
  resolveMediaSource(messageRef: MessageRef): ChannelMediaSource
}

export class ChannelMediaSourceError extends Error {
  constructor(
    readonly code: 'messageUnavailable' | 'mediaUnavailable',
    readonly retryable = false,
  ) {
    super(code)
    this.name = 'ChannelMediaSourceError'
  }
}

export function mediaSourceFromMessage(message: Message | null): ChannelMediaSource {
  if (!message || message.state !== 'active')
    throw new ChannelMediaSourceError('messageUnavailable')
  const content = message.content
  if (
    content.kind !== 'image' &&
    content.kind !== 'audio' &&
    content.kind !== 'video' &&
    content.kind !== 'file'
  )
    throw new ChannelMediaSourceError('mediaUnavailable')
  const url = content.media.url?.trim()
  if (!url) throw new ChannelMediaSourceError('mediaUnavailable')
  const expectedSize = content.media.size
  return {
    url,
    fileName: mediaFileName(content.kind, content.media, url),
    ...(content.media.mimeType ? { mimeType: content.media.mimeType } : {}),
    ...(Number.isSafeInteger(expectedSize) && expectedSize !== undefined && expectedSize >= 0
      ? { expectedSize }
      : {}),
  }
}

function mediaFileName(
  kind: 'image' | 'audio' | 'video' | 'file',
  media: MessageMediaAttachment,
  url: string,
): string {
  const name = media.name?.trim()
  if (name) return name
  const extension = normalizedExtension(media.extension) || extensionFromUrl(url)
  return `${kind === 'file' ? 'attachment' : kind}${extension ? `.${extension}` : ''}`
}

function extensionFromUrl(value: string): string {
  try {
    const name = new URL(value).pathname.split('/').pop() ?? ''
    return normalizedExtension(name.slice(name.lastIndexOf('.') + 1))
  } catch {
    return ''
  }
}

function normalizedExtension(value: string | undefined): string {
  const extension = value?.trim().replace(/^\.+/, '').toLowerCase() ?? ''
  return /^[a-z0-9]{1,16}$/.test(extension) ? extension : ''
}
