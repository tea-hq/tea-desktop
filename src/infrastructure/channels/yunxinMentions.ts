import type { JsonValue, MessageMention } from '@/features/channels/contracts'

const MAX_MENTIONS = 100
const MAX_RANGES = 100

export function withYunxinMentions(
  extension: JsonValue | undefined,
  mentions: MessageMention[] | undefined,
  text: string,
): JsonValue | undefined {
  if (!mentions?.length) return extension
  if (mentions.length > MAX_MENTIONS) throw new TypeError('tooManyMentions')
  if (extension !== undefined && !isRecord(extension)) throw new TypeError('invalidExtension')

  const yxAitEntries: Array<[string, JsonValue]> = []
  for (const mention of mentions) {
    const key =
      mention.target.kind === 'channel' ? 'ait_all' : validAccountId(mention.target.accountId)
    const label = validLabel(mention.label)
    if (!mention.ranges.length || mention.ranges.length > MAX_RANGES)
      throw new TypeError('invalidMentionRanges')
    const segments = mention.ranges.map((range) => {
      if (
        !Number.isInteger(range.start) ||
        !Number.isInteger(range.end) ||
        range.start < 0 ||
        range.end <= range.start ||
        range.end > text.length ||
        text.slice(range.start, range.end) !== label
      )
        throw new TypeError('invalidMentionRange')
      return { start: range.start, end: range.end, broken: false }
    })
    yxAitEntries.push([key, { text: label, segments }])
  }
  return { ...(extension ?? {}), yxAitMsg: Object.fromEntries(yxAitEntries) }
}

export function parseYunxinMentions(extension: JsonValue | undefined): MessageMention[] {
  if (!isRecord(extension) || !isRecord(extension.yxAitMsg)) return []
  return Object.entries(extension.yxAitMsg)
    .slice(0, MAX_MENTIONS)
    .map(([accountId, value]) => {
      if (!isRecord(value) || typeof value.text !== 'string') return null
      const label = value.text.slice(0, 201)
      if (!label || !Array.isArray(value.segments)) return null
      const ranges = value.segments
        .slice(0, MAX_RANGES)
        .map((segment) => {
          if (!isRecord(segment)) return null
          const start = segment.start
          const end = segment.end
          return Number.isInteger(start) &&
            Number.isInteger(end) &&
            (end as number) > (start as number) &&
            (start as number) >= 0
            ? { start: start as number, end: end as number }
            : null
        })
        .filter((range): range is NonNullable<typeof range> => range !== null)
      if (!ranges.length) return null
      return {
        target:
          accountId === 'ait_all'
            ? ({ kind: 'channel' } as const)
            : ({ kind: 'user', accountId } as const),
        label,
        ranges,
      }
    })
    .filter((mention): mention is NonNullable<typeof mention> => mention !== null)
}

function validAccountId(value: string): string {
  const accountId = value.trim()
  if (!accountId || accountId.length > 128 || accountId === 'ait_all' || accountId.includes('\0'))
    throw new TypeError('invalidMentionAccount')
  return accountId
}

function validLabel(value: string): string {
  const label = value.trim()
  if (!label.startsWith('@') || label.length < 2 || label.length > 201)
    throw new TypeError('invalidMentionLabel')
  return label
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
