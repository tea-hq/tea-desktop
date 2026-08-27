import { describe, expect, it } from 'vitest'
import { channelAvatarInitials, channelAvatarTone } from './channelAvatarPresentation'

describe('channel avatar presentation', () => {
  it('uses up to two visible characters and falls back to a question mark', () => {
    expect(channelAvatarInitials(' 林 晓 ')).toBe('林晓')
    expect(channelAvatarInitials('Tea Release')).toBe('TR')
    expect(channelAvatarInitials('')).toBe('?')
  })

  it('assigns a stable neutral tone from the channel ref', () => {
    expect(channelAvatarTone('team|app|one')).toBe(channelAvatarTone('team|app|one'))
    expect(channelAvatarTone('team|app|one')).toMatch(/^tone-[0-3]$/)
  })
})
