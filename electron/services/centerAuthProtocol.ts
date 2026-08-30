import type { CenterAuthErrorCode } from '../../src/features/auth/contracts'

export type { CenterAuthErrorCode } from '../../src/features/auth/contracts'

const REFRESH_PROOF_DOMAIN = 'tea-center-refresh-v1'

export function handoffProofPayload(transactionId: string, handoffCode: string): Buffer {
  return Buffer.from(`${transactionId}\n${handoffCode}`, 'utf8')
}

export function refreshProofPayload(refreshCredential: string): Buffer {
  return Buffer.from(`${REFRESH_PROOF_DOMAIN}\n${refreshCredential}`, 'utf8')
}

export function normalizeCenterAuthErrorCode(code: string): CenterAuthErrorCode {
  switch (code) {
    case 'invalidRequest':
    case 'organizationUnavailable':
    case 'centerUnavailable':
    case 'invalidCallback':
    case 'callbackExpired':
    case 'loginCancelled':
    case 'storageFailure':
    case 'recoveryRequired':
    case 'authorizationDenied':
    case 'protocolFailure':
    case 'secureStorageUnavailable':
      return code
    case 'invalid_input':
      return 'invalidRequest'
    case 'authorization_denied':
      return 'authorizationDenied'
    case 'unauthenticated':
    case 'session_revoked':
    case 'recovery_required':
      return 'recoveryRequired'
    case 'handoff_expired':
    case 'handoff_consumed':
      return 'callbackExpired'
    default:
      return 'protocolFailure'
  }
}
