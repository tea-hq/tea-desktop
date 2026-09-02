import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { stat } from 'node:fs/promises'

import type { ChannelAttachment } from '../../src/features/channels/contracts'
import type {
  MessageAttachmentResolver,
  ResolvedMessageAttachment,
} from '../../src/infrastructure/channels/YunxinWebChannelTransport'

const MAX_ATTACHMENTS = 10
const MAX_FILE_SIZE = 100 * 1024 * 1024
const TOKEN_TTL_MS = 10 * 60_000
const MAX_TOKENS = 64

interface AttachmentEntry extends ResolvedMessageAttachment {
  expiresAt: number
}

export class ElectronChannelAttachmentService implements MessageAttachmentResolver {
  private readonly entries = new Map<string, AttachmentEntry>()

  constructor(private readonly selectPaths: () => Promise<string[]>) {}

  async select(): Promise<ChannelAttachment[]> {
    this.prune()
    const paths = await this.selectPaths()
    const attachments: ChannelAttachment[] = []
    for (const filePath of paths) {
      if (attachments.length >= MAX_ATTACHMENTS) break
      const metadata = await describeFile(filePath)
      if (!metadata) continue
      const token = `file:${randomBytes(32).toString('base64url')}`
      this.entries.set(token, { ...metadata, expiresAt: Date.now() + TOKEN_TTL_MS })
      attachments.push({
        token,
        name: metadata.name,
        ...(metadata.mimeType ? { mimeType: metadata.mimeType } : {}),
        size: metadata.size,
        extension: metadata.extension,
        kind: metadata.kind,
      })
    }
    this.prune()
    return attachments
  }

  async resolve(token: string): Promise<ResolvedMessageAttachment | null> {
    this.prune()
    const entry = this.entries.get(token)
    if (!entry) return null
    try {
      const current = await stat(entry.path)
      if (!current.isFile() || current.size > MAX_FILE_SIZE) return null
    } catch {
      return null
    }
    return { ...entry }
  }

  release(token: string): void {
    this.entries.delete(token)
  }

  dispose(): void {
    this.entries.clear()
  }

  private prune(): void {
    const now = Date.now()
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(token)
    }
    while (this.entries.size > MAX_TOKENS) {
      const oldest = this.entries.keys().next().value
      if (typeof oldest !== 'string') break
      this.entries.delete(oldest)
    }
  }
}

async function describeFile(
  filePath: string,
): Promise<(ResolvedMessageAttachment & { kind: ChannelAttachment['kind'] }) | null> {
  const normalized = path.resolve(filePath)
  try {
    const info = await stat(normalized)
    if (!info.isFile() || info.size > MAX_FILE_SIZE) return null
    const name = path.basename(normalized).slice(0, 512)
    const extension = extensionOf(name)
    const mimeType = mimeTypeFor(extension)
    return {
      path: normalized,
      name: name || 'attachment',
      size: info.size,
      ...(extension ? { extension } : {}),
      ...(mimeType ? { mimeType } : {}),
      kind: mediaKind(mimeType),
    }
  } catch {
    return null
  }
}

function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return undefined
  return name.slice(dot + 1, dot + 33).toLowerCase()
}

function mimeTypeFor(extension: string | undefined): string | undefined {
  if (!extension) return undefined
  const values: Record<string, string> = {
    aac: 'audio/aac',
    avi: 'video/x-msvideo',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    m4a: 'audio/mp4',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    wav: 'audio/wav',
    webm: 'video/webm',
    webp: 'image/webp',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
  }
  return values[extension]
}

function mediaKind(mimeType: string | undefined): ChannelAttachment['kind'] {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('video/')) return 'video'
  return 'file'
}
