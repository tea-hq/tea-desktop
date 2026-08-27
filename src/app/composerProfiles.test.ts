import { describe, expect, it } from 'vitest'
import { drawerAgentProfile, fullAgentProfile, isComposerProfile } from './composerProfiles'

describe('composer profiles', () => {
  it('exposes only the fixed full and drawer profiles', () => {
    expect(isComposerProfile(fullAgentProfile)).toBe(true)
    expect(isComposerProfile(drawerAgentProfile)).toBe(true)
    expect(isComposerProfile({ ...drawerAgentProfile })).toBe(false)
    expect(Object.isFrozen(fullAgentProfile)).toBe(true)
  })
})
