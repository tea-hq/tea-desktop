export type PermissionMode = 'default' | 'readOnly' | 'fullAccess'
export type ApprovalDecision = 'allowOnce' | 'allowSession' | 'deny' | 'cancel'

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw { code: 'invalidRequest', retryable: false }
  }
  return value as Record<string, unknown>
}

export function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw {
      code: 'invalidRequest',
      retryable: false,
      message: `${name} must be a non-empty string`,
    }
  }
  return value
}

export function readInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value)) {
    throw {
      code: 'invalidRequest',
      retryable: false,
      message: `${name} must be an integer`,
    }
  }
  return value as number
}

export function readPermissionMode(value: unknown): PermissionMode {
  if (value === 'default' || value === 'readOnly' || value === 'fullAccess') return value
  throw {
    code: 'invalidRequest',
    retryable: false,
    message: 'permissionMode is invalid',
  }
}

export function readApprovalDecision(value: unknown): ApprovalDecision {
  if (value === 'allowOnce' || value === 'allowSession' || value === 'deny' || value === 'cancel') {
    return value
  }
  throw {
    code: 'invalidRequest',
    retryable: false,
    message: 'approval decision is invalid',
  }
}
