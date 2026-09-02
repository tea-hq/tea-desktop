import type { ChannelPresence } from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'

export const YUNXIN_PRESENCE_DURATION_SECONDS = 30 * 60
export const YUNXIN_PRESENCE_RENEWAL_MS = 20 * 60 * 1_000

const maximumAccounts = 3_000
const maximumAccountLength = 512
const maximumBatchSize = 100
const maximumServerExtensionLength = 4_096

export interface YunxinPresenceServicePort {
  subscribeUserStatus(request: {
    accountIds: string[]
    duration: number
    immediateSync: boolean
  }): Promise<string[]>
  unsubscribeUserStatus(request: { accountIds: string[] }): Promise<string[]>
}

export interface YunxinPresenceReconciliation {
  subscribed: Set<string>
  failed: boolean
}

export function normalizePresenceAccountIds(values: string[]): string[] {
  if (!Array.isArray(values)) throw new ChannelTransportError('invalidRequest', false)
  const normalized = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') throw new ChannelTransportError('invalidRequest', false)
    const accountId = value.trim()
    if (!validAccountId(accountId)) throw new ChannelTransportError('invalidRequest', false)
    normalized.add(accountId)
    if (normalized.size > maximumAccounts) throw new ChannelTransportError('limitExceeded', false)
  }
  return [...normalized]
}

export function mapYunxinPresenceStatuses(values: readonly unknown[]): ChannelPresence[] {
  if (!Array.isArray(values)) return []
  const mapped = new Map<string, ChannelPresence>()
  for (const value of values) {
    const presence = mapYunxinPresenceStatus(value)
    if (!presence) continue
    const current = mapped.get(presence.accountId)
    if (
      !current ||
      presence.updatedAt > current.updatedAt ||
      (presence.updatedAt === current.updatedAt &&
        availabilityPriority(presence.availability) > availabilityPriority(current.availability))
    ) {
      mapped.set(presence.accountId, presence)
    }
  }
  return [...mapped.values()]
}

export async function reconcileYunxinPresenceSubscriptions(
  service: YunxinPresenceServicePort,
  current: ReadonlySet<string>,
  desiredAccountIds: readonly string[],
  options: { renew?: boolean } = {},
): Promise<YunxinPresenceReconciliation> {
  const desired = new Set(desiredAccountIds)
  const subscribed = new Set(current)
  let failed = false

  const removals = [...current].filter((accountId) => !desired.has(accountId))
  for (const batch of batches(removals)) {
    const result = await callProviderBatch(batch, (accountIds) =>
      service.unsubscribeUserStatus({ accountIds }),
    )
    failed ||= result.failed
    for (const accountId of result.succeeded) subscribed.delete(accountId)
  }

  const additions = options.renew
    ? [...desired]
    : [...desired].filter((accountId) => !current.has(accountId))
  for (const batch of batches(additions)) {
    const result = await callProviderBatch(batch, (accountIds) =>
      service.subscribeUserStatus({
        accountIds,
        duration: YUNXIN_PRESENCE_DURATION_SECONDS,
        immediateSync: options.renew !== true,
      }),
    )
    failed ||= result.failed
    for (const accountId of result.succeeded) subscribed.add(accountId)
  }

  return { subscribed, failed }
}

function mapYunxinPresenceStatus(value: unknown): ChannelPresence | null {
  if (!isRecord(value)) return null
  const accountId = typeof value.accountId === 'string' ? value.accountId.trim() : ''
  const statusType = value.statusType
  const updatedAt = value.publishTime
  if (
    !validAccountId(accountId) ||
    !Number.isInteger(statusType) ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(updatedAt) ||
    updatedAt < 0
  ) {
    return null
  }
  if ((statusType as number) > 10_000) return null

  const availability =
    statusType === 1
      ? 'online'
      : statusType === 2 || statusType === 3
        ? hasOtherOnlineClient(value.serverExtension)
          ? 'online'
          : 'offline'
        : 'unknown'
  return { accountId, availability, updatedAt }
}

function hasOtherOnlineClient(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > maximumServerExtensionLength) return false
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) && Array.isArray(parsed.online) && parsed.online.length > 0
  } catch {
    return false
  }
}

function validAccountId(value: string): boolean {
  return (
    value.length > 0 && value.length <= maximumAccountLength && !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function availabilityPriority(value: ChannelPresence['availability']): number {
  return value === 'online' ? 2 : value === 'offline' ? 1 : 0
}

function batches(values: string[]): string[][] {
  const result: string[][] = []
  for (let offset = 0; offset < values.length; offset += maximumBatchSize) {
    result.push(values.slice(offset, offset + maximumBatchSize))
  }
  return result
}

async function callProviderBatch(
  batch: string[],
  operation: (accountIds: string[]) => Promise<string[]>,
): Promise<{ succeeded: string[]; failed: boolean }> {
  let failedIds: unknown
  try {
    failedIds = await operation([...batch])
  } catch (error) {
    if (error instanceof ChannelTransportError) throw error
    return { succeeded: [], failed: true }
  }
  if (
    !Array.isArray(failedIds) ||
    failedIds.some((value) => typeof value !== 'string' || !batch.includes(value))
  ) {
    return { succeeded: [], failed: true }
  }
  const failures = new Set(failedIds)
  return {
    succeeded: batch.filter((accountId) => !failures.has(accountId)),
    failed: failures.size > 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
