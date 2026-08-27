import { describe, expect, it } from 'vitest'
import { isTimelineNearBottom, restorePrependScrollTop } from './channelTimelineScroll'

describe('channel timeline scroll behavior', () => {
  it('detects whether the reader is close enough to follow realtime messages', () => {
    expect(isTimelineNearBottom({ scrollHeight: 1_000, scrollTop: 480, clientHeight: 400 })).toBe(true)
    expect(isTimelineNearBottom({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 400 })).toBe(false)
  })

  it('preserves the visible position after older messages are prepended', () => {
    expect(restorePrependScrollTop(
      { scrollHeight: 1_000, scrollTop: 240 },
      1_650,
    )).toBe(890)
  })
})
