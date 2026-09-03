import { describe, expect, it } from 'vitest'

import { createDefaultAvatarDataUri } from './defaultAvatar'

describe('createDefaultAvatarDataUri', () => {
  it('is deterministic for the same seed and differentiates users', () => {
    const first = createDefaultAvatarDataUri('tea:account:alice')
    expect(createDefaultAvatarDataUri('tea:account:alice')).toBe(first)
    expect(createDefaultAvatarDataUri('tea:account:bob')).not.toBe(first)
  })

  it('applies a caller-selected background color', () => {
    const avatar = createDefaultAvatarDataUri('tea:account:alice', {
      backgroundColor: '#abcdef',
    })
    expect(decodeURIComponent(avatar)).toContain('#abcdef')
  })

  it('uses a fixed yellow skin tone and black hair for every account', () => {
    const alice = decodeURIComponent(createDefaultAvatarDataUri('tea:account:alice'))
    const bob = decodeURIComponent(createDefaultAvatarDataUri('tea:account:bob'))

    expect(alice).toContain('#f8d25c')
    expect(alice).toContain('#2c1b18')
    expect(bob).toContain('#f8d25c')
    expect(bob).toContain('#2c1b18')
  })
})
