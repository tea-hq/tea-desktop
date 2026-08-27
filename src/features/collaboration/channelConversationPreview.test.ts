import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from '@/features/conversation/contracts'
import { formatConversationAge, recentChannelConversations } from './channelConversationPreview'

function summary(conversationId: string, updatedAt: number): ConversationSummary {
  return {
    conversationId,
    runtimeId: 'external.codex',
    workspaceId: 'default',
    updatedAt,
    createdAt: updatedAt,
  }
}

describe('channel conversation preview', () => {
  it('keeps only the four most recently active conversations', () => {
    const conversations = [
      summary('one', 1),
      summary('five', 5),
      summary('three', 3),
      summary('two', 2),
      summary('four', 4),
    ]

    expect(recentChannelConversations(conversations).map(value => value.conversationId))
      .toEqual(['five', 'four', 'three', 'two'])
    expect(conversations.map(value => value.conversationId))
      .toEqual(['one', 'five', 'three', 'two', 'four'])
  })

  it('uses relative time for recent activity and a compact date for older activity', () => {
    const now = Date.UTC(2026, 7, 22, 12)

    expect(formatConversationAge(now - 12 * 60_000, 'en', now)).toBe('12 minutes ago')
    expect(formatConversationAge(now - 2 * 86_400_000, 'en', now)).toBe('2 days ago')
    expect(formatConversationAge(Date.UTC(2026, 6, 1), 'en', now)).toBe('Jul 1')
  })
})
