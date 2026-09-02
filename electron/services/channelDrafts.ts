import type {
  ChannelDraft,
  MessageMention,
  MessageMentionTarget,
  SaveChannelDraftRequest,
} from '../../src/features/channels/contracts'
import { JsonStore, serviceError } from './jsonStore'

const CHANNEL_DRAFT_SCHEMA_VERSION = 1
const MAX_CATALOG_BYTES = 8 * 1024 * 1024
const MAX_DRAFTS = 2_000
const MAX_ID_CHARS = 512
const MAX_TEXT_CHARS = 64 * 1024
const MAX_MENTIONS = 100
const MAX_MENTION_LABEL_CHARS = 201
const MAX_MENTION_RANGES = 100

interface ChannelDraftCatalog {
  drafts: ChannelDraft[]
}

const EMPTY_CATALOG: ChannelDraftCatalog = { drafts: [] }

export class ElectronChannelDraftService {
  private readonly store: JsonStore<ChannelDraftCatalog>
  private state: ChannelDraftCatalog = structuredClone(EMPTY_CATALOG)
  private initialized = false
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(
    filePath: string,
    private readonly now: () => number = Date.now,
  ) {
    this.store = new JsonStore(filePath, {
      schemaVersion: CHANNEL_DRAFT_SCHEMA_VERSION,
      maxBytes: MAX_CATALOG_BYTES,
    })
  }

  async initialize(): Promise<void> {
    const stored = await this.store.load(EMPTY_CATALOG)
    this.state = normalizeStoredCatalog(stored)
    this.initialized = true
  }

  list(accountRef: unknown): ChannelDraft[] {
    this.assertInitialized()
    const normalizedAccountRef = normalizeId(accountRef, 'accountRef')
    return this.state.drafts
      .filter((draft) => draft.accountRef === normalizedAccountRef)
      .map((draft) => structuredClone(draft))
  }

  async save(request: unknown): Promise<ChannelDraft> {
    this.assertInitialized()
    const normalized = normalizeSaveRequest(request)
    return this.enqueueMutation(async () => {
      const draft: ChannelDraft = {
        ...normalized,
        updatedAt: normalizeTimestamp(this.now()),
      }
      const exists = this.state.drafts.some(
        (candidate) =>
          candidate.accountRef === draft.accountRef && candidate.channelRef === draft.channelRef,
      )
      if (!exists && this.state.drafts.length >= MAX_DRAFTS)
        throw serviceError('limitExceeded', false)
      const next = {
        drafts: [
          ...this.state.drafts.filter(
            (candidate) =>
              candidate.accountRef !== draft.accountRef ||
              candidate.channelRef !== draft.channelRef,
          ),
          draft,
        ].sort(compareDrafts),
      }
      await this.store.save(next)
      this.state = next
      return structuredClone(draft)
    })
  }

  async remove(accountRef: unknown, channelRef: unknown): Promise<void> {
    this.assertInitialized()
    const normalizedAccountRef = normalizeId(accountRef, 'accountRef')
    const normalizedChannelRef = normalizeId(channelRef, 'channelRef')
    return this.enqueueMutation(async () => {
      const next = {
        drafts: this.state.drafts.filter(
          (draft) =>
            draft.accountRef !== normalizedAccountRef || draft.channelRef !== normalizedChannelRef,
        ),
      }
      if (next.drafts.length === this.state.drafts.length) return
      await this.store.save(next)
      this.state = next
    })
  }

  private enqueueMutation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.mutationQueue.catch(() => undefined).then(operation)
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private assertInitialized(): void {
    if (!this.initialized) throw serviceError('notInitialized', true)
  }
}

function normalizeStoredCatalog(value: unknown): ChannelDraftCatalog {
  if (!isRecord(value) || !Array.isArray(value.drafts)) return structuredClone(EMPTY_CATALOG)
  const drafts = new Map<string, ChannelDraft>()
  for (const row of value.drafts.slice(0, MAX_DRAFTS)) {
    const draft = normalizeStoredDraft(row)
    if (!draft) continue
    const key = `${draft.accountRef}\0${draft.channelRef}`
    const existing = drafts.get(key)
    if (!existing || compareDrafts(draft, existing) < 0) drafts.set(key, draft)
  }
  return { drafts: [...drafts.values()].sort(compareDrafts) }
}

function normalizeStoredDraft(value: unknown): ChannelDraft | null {
  if (!isRecord(value)) return null
  try {
    return {
      ...normalizeSaveRequest(value),
      updatedAt: normalizeTimestamp(value.updatedAt),
    }
  } catch {
    return null
  }
}

function normalizeSaveRequest(value: unknown): SaveChannelDraftRequest {
  if (!isRecord(value)) throw serviceError('invalidRequest', false)
  const text = value.text
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS)
    throw serviceError('invalidRequest', false, 'text is invalid')
  if (!Array.isArray(value.mentions) || value.mentions.length > MAX_MENTIONS)
    throw serviceError('invalidRequest', false, 'mentions are invalid')
  return {
    accountRef: normalizeId(value.accountRef, 'accountRef'),
    channelRef: normalizeId(value.channelRef, 'channelRef'),
    text,
    mentions: value.mentions.map((mention) => normalizeMention(mention, text)),
  }
}

function normalizeMention(value: unknown, text: string): MessageMention {
  if (!isRecord(value)) throw serviceError('invalidRequest', false, 'mention is invalid')
  const label = value.label
  if (
    typeof label !== 'string' ||
    !label.trim() ||
    label.length > MAX_MENTION_LABEL_CHARS ||
    !Array.isArray(value.ranges) ||
    value.ranges.length === 0 ||
    value.ranges.length > MAX_MENTION_RANGES
  )
    throw serviceError('invalidRequest', false, 'mention is invalid')
  return {
    target: normalizeMentionTarget(value.target),
    label,
    ranges: value.ranges.map((range) => {
      if (!isRecord(range)) throw serviceError('invalidRequest', false, 'mention range is invalid')
      const start = range.start
      const end = range.end
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        (start as number) < 0 ||
        (end as number) <= (start as number) ||
        (end as number) > text.length ||
        text.slice(start as number, end as number) !== label
      )
        throw serviceError('invalidRequest', false, 'mention range is invalid')
      return { start: start as number, end: end as number }
    }),
  }
}

function normalizeMentionTarget(value: unknown): MessageMentionTarget {
  if (!isRecord(value)) throw serviceError('invalidRequest', false, 'mention target is invalid')
  if (value.kind === 'channel') return { kind: 'channel' }
  if (value.kind === 'user')
    return { kind: 'user', accountId: normalizeId(value.accountId, 'mention accountId') }
  throw serviceError('invalidRequest', false, 'mention target is invalid')
}

function normalizeId(value: unknown, name: string): string {
  if (typeof value !== 'string') throw serviceError('invalidRequest', false, `${name} is invalid`)
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_ID_CHARS)
    throw serviceError('invalidRequest', false, `${name} is invalid`)
  return normalized
}

function normalizeTimestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw serviceError('invalidRequest', false, 'updatedAt is invalid')
  return value as number
}

function compareDrafts(left: ChannelDraft, right: ChannelDraft): number {
  return right.updatedAt - left.updatedAt || left.channelRef.localeCompare(right.channelRef)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
