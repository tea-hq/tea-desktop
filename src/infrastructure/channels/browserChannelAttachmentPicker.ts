import type {
  ChannelAttachment,
  ChannelAttachmentPicker,
  MessageMediaKind,
} from '@/features/channels/contracts'

const MAX_ATTACHMENTS = 10
const MAX_FILE_SIZE = 100 * 1024 * 1024

/**
 * Preview-only picker. It deliberately keeps the File object in the browser
 * boundary; the mock transport only needs stable metadata and an opaque token.
 */
export class BrowserChannelAttachmentPicker implements ChannelAttachmentPicker {
  async pick(): Promise<ChannelAttachment[]> {
    if (typeof document === 'undefined') return []
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip'
    input.tabIndex = -1

    const files = await new Promise<File[]>((resolve) => {
      input.addEventListener('change', () => resolve(input.files ? [...input.files] : []), {
        once: true,
      })
      input.click()
    })

    return files
      .slice(0, MAX_ATTACHMENTS)
      .filter((file) => file.size <= MAX_FILE_SIZE)
      .map((file) => ({
        token: `browser:${randomId()}`,
        name: file.name.slice(0, 512) || 'attachment',
        ...(file.type ? { mimeType: file.type.slice(0, 128) } : {}),
        size: file.size,
        extension: extensionOf(file.name),
        kind: mediaKind(file.type),
      }))
  }
}

function mediaKind(mimeType: string): MessageMediaKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return undefined
  return name.slice(dot + 1, dot + 33).toLowerCase()
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
