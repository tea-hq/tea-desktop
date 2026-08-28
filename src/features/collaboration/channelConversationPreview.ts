import type { ConversationSummary } from '@/features/conversation/contracts'

export function recentChannelConversations(
  conversations: ConversationSummary[],
  limit = 4,
): ConversationSummary[] {
  return [...conversations]
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt || right.conversationId.localeCompare(left.conversationId),
    )
    .slice(0, limit)
}

export function formatConversationAge(
  updatedAt: number,
  locale?: string,
  now = Date.now(),
): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const elapsed = updatedAt - now
  const absolute = Math.abs(elapsed)

  if (absolute < 60_000) return formatter.format(0, 'minute')
  if (absolute < 3_600_000) return formatter.format(Math.round(elapsed / 60_000), 'minute')
  if (absolute < 86_400_000) return formatter.format(Math.round(elapsed / 3_600_000), 'hour')
  if (absolute < 604_800_000) return formatter.format(Math.round(elapsed / 86_400_000), 'day')
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(updatedAt)
}
