import { createHash } from 'node:crypto'
import type { MergedMessageAbstract } from '@/features/channels/contracts'
import type { V2NIMMessage } from 'nim-web-sdk-ng/dist/v2/NIM_BROWSER_SDK/V2NIMMessageService'

export const YUNXIN_MERGED_MESSAGE_TYPE = 101
export const YUNXIN_MERGED_ARCHIVE_LIMIT = 5 * 1024 * 1024

export interface YunxinMergedMessagePayload {
  type: typeof YUNXIN_MERGED_MESSAGE_TYPE
  data: {
    abstracts: Array<{ senderNick: string; content: string; userAccId: string }>
    depth: number
    md5: string
    sessionId: string
    sessionName: string
    url: string
  }
}

export interface YunxinMergedArchiveMessage {
  message: V2NIMMessage
  senderName: string
  avatarUrl?: string
}

export interface YunxinMessageConverterPort {
  messageSerialization(message: V2NIMMessage): string | null
  messageDeserialization(message: string): V2NIMMessage | null
}

export interface YunxinMergedArchiveLoader {
  load(url: string): Promise<string>
}

export function encodeYunxinMergedMessagePayload(input: {
  abstracts: MergedMessageAbstract[]
  depth: number
  md5: string
  sessionId: string
  sessionName: string
  url: string
}): string {
  if (
    !Number.isInteger(input.depth) ||
    input.depth < 1 ||
    input.depth > 3 ||
    !/^[a-f0-9]{32}$/i.test(input.md5) ||
    !validHttpsUrl(input.url) ||
    input.sessionId.length > 200 ||
    input.sessionName.length > 200
  )
    throw new Error('mergedMessagePayloadInvalid')
  const payload: YunxinMergedMessagePayload = {
    type: YUNXIN_MERGED_MESSAGE_TYPE,
    data: {
      abstracts: input.abstracts.slice(0, 3).map((item) => ({
        senderNick: item.senderName.slice(0, 200),
        content: item.text.slice(0, 500),
        userAccId: item.senderAccountId.slice(0, 128),
      })),
      depth: input.depth,
      md5: input.md5,
      sessionId: input.sessionId.slice(0, 200),
      sessionName: input.sessionName.slice(0, 200),
      url: input.url,
    },
  }
  return JSON.stringify(payload)
}

export function decodeYunxinMergedMessagePayload(raw: string): YunxinMergedMessagePayload | null {
  if (!raw || raw.length > 16_384) return null
  try {
    const payload = JSON.parse(raw) as YunxinMergedMessagePayload
    const data = payload?.data
    if (
      payload?.type !== YUNXIN_MERGED_MESSAGE_TYPE ||
      !data ||
      !Number.isInteger(data.depth) ||
      data.depth < 1 ||
      data.depth > 3 ||
      !/^[a-f0-9]{32}$/i.test(data.md5) ||
      !validHttpsUrl(data.url) ||
      typeof data.sessionId !== 'string' ||
      data.sessionId.length > 200 ||
      typeof data.sessionName !== 'string' ||
      data.sessionName.length > 200 ||
      !Array.isArray(data.abstracts) ||
      data.abstracts.length > 3 ||
      data.abstracts.some(
        (item) =>
          !item ||
          typeof item.senderNick !== 'string' ||
          item.senderNick.length > 200 ||
          typeof item.content !== 'string' ||
          item.content.length > 500 ||
          typeof item.userAccId !== 'string' ||
          item.userAccId.length > 128,
      )
    )
      return null
    return payload
  } catch {
    return null
  }
}

export function yunxinMergedPayloadFromMessage(
  message: Pick<V2NIMMessage, 'messageType' | 'attachment'>,
): YunxinMergedMessagePayload | null {
  if (message.messageType !== 100) return null
  const attachment = asRecord(message.attachment)
  return typeof attachment?.raw === 'string'
    ? decodeYunxinMergedMessagePayload(attachment.raw)
    : null
}

export function serializeYunxinMergedArchive(
  messages: YunxinMergedArchiveMessage[],
  converter: YunxinMessageConverterPort,
  metadata: { appVersion: string; sdkVersion: string },
): string {
  const serialized = messages.map((item) => {
    const extension = parseExtension(item.message.serverExtension)
    const value = {
      ...item.message,
      serverExtension: JSON.stringify({
        ...extension,
        mergedMessageAvatarKey: item.avatarUrl ?? '',
        mergedMessageNickKey: item.senderName,
      }),
    } as V2NIMMessage
    const result = converter.messageSerialization(value)
    if (!result) throw new Error('mergedMessageSerializationFailed')
    return result
  })
  const header = JSON.stringify({
    version: 1,
    terminal: 'web',
    sdk_version: metadata.sdkVersion,
    app_version: metadata.appVersion,
    message_count: serialized.length,
  })
  const content = [header, ...serialized].join('\n')
  assertArchiveSize(content)
  return content
}

export function deserializeYunxinMergedArchive(
  content: string,
  converter: YunxinMessageConverterPort,
): V2NIMMessage[] {
  const normalized = normalizeYunxinMergedArchive(content)
  assertArchiveSize(normalized)
  const lines = normalized.split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('mergedMessageArchiveInvalid')
  let header: { version?: unknown; message_count?: unknown }
  try {
    header = JSON.parse(lines[0]!) as { version?: unknown; message_count?: unknown }
  } catch {
    throw new Error('mergedMessageArchiveInvalid')
  }
  if (header.version !== 1 || header.message_count !== lines.length - 1)
    throw new Error('mergedMessageArchiveInvalid')
  return lines.slice(1).map((line) => {
    const value = converter.messageDeserialization(line)
    if (!value) throw new Error('mergedMessageDeserializationFailed')
    return value
  })
}

export function normalizeYunxinMergedArchive(content: string): string {
  return (content || '').replace(/("12"\s*:\s*)(\d+)/g, '$1"$2"')
}

export function yunxinMergedArchiveMd5(content: string): string {
  return createHash('md5').update(content, 'utf8').digest('hex')
}

export const defaultYunxinMergedArchiveLoader: YunxinMergedArchiveLoader = {
  async load(url) {
    if (!validHttpsUrl(url)) throw new Error('mergedMessageArchiveUrlInvalid')
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`mergedMessageArchiveFetchFailed:${response.status}`)
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > YUNXIN_MERGED_ARCHIVE_LIMIT)
      throw new Error('mergedMessageArchiveTooLarge')
    const content = await readBoundedUtf8(response)
    assertArchiveSize(content)
    return content
  },
}

async function readBoundedUtf8(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    const content = await response.text()
    assertArchiveSize(content)
    return content
  }
  const decoder = new TextDecoder()
  const parts: string[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > YUNXIN_MERGED_ARCHIVE_LIMIT) {
        try {
          await reader.cancel()
        } catch {
          // The size violation remains authoritative even if cancellation fails.
        }
        throw new Error('mergedMessageArchiveTooLarge')
      }
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
    return parts.join('')
  } finally {
    reader.releaseLock()
  }
}

function assertArchiveSize(content: string): void {
  if (new TextEncoder().encode(content).byteLength > YUNXIN_MERGED_ARCHIVE_LIMIT)
    throw new Error('mergedMessageArchiveTooLarge')
}

function parseExtension(value: string | undefined): Record<string, unknown> {
  if (!value || value.length > 4_096) return {}
  try {
    return asRecord(JSON.parse(value)) ?? {}
  } catch {
    return {}
  }
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2_048) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
