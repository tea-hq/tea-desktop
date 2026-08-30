import { describe, expect, it } from 'vitest'

import {
  handoffProofPayload,
  normalizeCenterAuthErrorCode,
  refreshProofPayload,
} from './centerAuthProtocol'

describe('center auth protocol', () => {
  it('builds exact UTF-8 proof payloads', () => {
    expect(handoffProofPayload('transaction-1', 'handoff-code').toString('utf8')).toBe(
      'transaction-1\nhandoff-code',
    )
    expect(refreshProofPayload('v1.credential.key').toString('utf8')).toBe(
      'tea-center-refresh-v1\nv1.credential.key',
    )
  })

  it('maps Center wire errors to stable Desktop auth codes', () => {
    expect(normalizeCenterAuthErrorCode('authorization_denied')).toBe('authorizationDenied')
    expect(normalizeCenterAuthErrorCode('session_revoked')).toBe('recoveryRequired')
    expect(normalizeCenterAuthErrorCode('recovery_required')).toBe('recoveryRequired')
    expect(normalizeCenterAuthErrorCode('handoff_consumed')).toBe('callbackExpired')
    expect(normalizeCenterAuthErrorCode('unexpected_code')).toBe('protocolFailure')
  })
})
