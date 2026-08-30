import type { RuntimeDescriptor } from './contracts'

export function readyRuntimeId(
  runtimes: RuntimeDescriptor[],
  runtimeId: string | null | undefined,
): string | null {
  return (
    runtimes.find((runtime) => runtime.id === runtimeId && runtime.status === 'ready')?.id ?? null
  )
}

export function resolvePreferredRuntimeId(
  runtimes: RuntimeDescriptor[],
  preferredRuntimeId: string | null | undefined,
): string | null {
  return (
    readyRuntimeId(runtimes, preferredRuntimeId) ??
    runtimes.find((runtime) => runtime.status === 'ready')?.id ??
    null
  )
}
