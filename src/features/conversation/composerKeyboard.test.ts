import { describe, expect, it } from 'vitest'

import { shouldSendFromComposer } from './composerKeyboard'

const enter = {
  key: 'Enter',
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
}

describe('shouldSendFromComposer', () => {
  it('does not send while an input method is composing text', () => {
    expect(shouldSendFromComposer(enter, true)).toBe(false)
    expect(shouldSendFromComposer({ ...enter, isComposing: true }, false)).toBe(false)
    expect(shouldSendFromComposer({ ...enter, keyCode: 229 }, false)).toBe(false)
  })

  it('keeps Shift+Enter for a newline', () => {
    expect(shouldSendFromComposer({ ...enter, shiftKey: true }, false)).toBe(false)
  })

  it('sends on a plain Enter after composition has ended', () => {
    expect(shouldSendFromComposer(enter, false)).toBe(true)
  })
})
