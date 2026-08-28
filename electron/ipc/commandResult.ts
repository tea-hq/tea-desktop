import type { DesktopCommandError, DesktopCommandResult } from '../../src/types/electronBridge'

const MAX_ERROR_MESSAGE_CHARS = 1_024

export async function settleDesktopCommand(
  operation: () => unknown | Promise<unknown>,
): Promise<DesktopCommandResult<unknown>> {
  try {
    return { ok: true, value: await operation() }
  } catch (cause) {
    return { ok: false, error: normalizeDesktopCommandError(cause) }
  }
}

export function normalizeDesktopCommandError(value: unknown): DesktopCommandError {
  const candidate = isRecord(value) ? value : undefined
  const code =
    typeof candidate?.code === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate.code)
      ? candidate.code
      : 'internal'
  const message =
    code === 'internal' || typeof candidate?.message !== 'string'
      ? undefined
      : boundedMessage(candidate.message)
  return {
    code,
    retryable: candidate?.retryable === true,
    ...(message ? { message } : {}),
  }
}

function boundedMessage(value: string): string | undefined {
  const normalized = [...value]
    .filter((character) => !/\p{Cc}/u.test(character))
    .slice(0, MAX_ERROR_MESSAGE_CHARS)
    .join('')
    .trim()
  return normalized || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
