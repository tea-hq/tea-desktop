import { describe, expect, it } from 'vitest'

import { unwrapDesktopCommandResult } from '../../src/types/electronBridge'
import { normalizeDesktopCommandError, settleDesktopCommand } from './commandResult'

describe('desktop command results', () => {
  it('preserves stable typed failures across the Electron serialization boundary', async () => {
    const result = await settleDesktopCommand(() => {
      throw { code: 'runtimeUnavailable', retryable: true, message: 'Agent is unavailable' }
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'runtimeUnavailable', retryable: true, message: 'Agent is unavailable' },
    })
    expect(() => unwrapDesktopCommandResult(result)).toThrow(
      expect.objectContaining({ code: 'runtimeUnavailable', retryable: true }),
    )
  })

  it('does not expose unknown error messages and rejects malformed envelopes', () => {
    expect(normalizeDesktopCommandError(new Error('credential-like diagnostic'))).toEqual({
      code: 'internal',
      retryable: false,
    })
    expect(() => unwrapDesktopCommandResult({ ok: true })).toThrow(
      expect.objectContaining({ code: 'transportFailure', retryable: true }),
    )
  })

  it('preserves messages from explicitly typed internal failures', () => {
    expect(
      normalizeDesktopCommandError({
        code: 'internal',
        retryable: true,
        message: 'cloud runner state is temporarily unavailable',
      }),
    ).toEqual({
      code: 'internal',
      retryable: true,
      message: 'cloud runner state is temporarily unavailable',
    })
  })

  it('returns successful values unchanged', async () => {
    const result = await settleDesktopCommand(() => ({ conversationId: 'conversation-1' }))
    expect(unwrapDesktopCommandResult(result)).toEqual({ conversationId: 'conversation-1' })
  })
})
