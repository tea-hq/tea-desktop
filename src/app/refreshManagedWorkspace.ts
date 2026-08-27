import type { CenterAuthPhase } from '@/features/auth/contracts'

interface RefreshableCenterAuth {
  state: { phase: CenterAuthPhase }
  refresh(): Promise<void>
}

interface RefreshableManagedWorkspace {
  readonly imReady: boolean
  refresh(): Promise<void>
}

export async function recoverManagedWorkspace(
  centerAuth: RefreshableCenterAuth,
  managedRuntime: RefreshableManagedWorkspace,
  connectIm: () => Promise<void>,
): Promise<void> {
  if (authPhase(centerAuth) === 'offlineCached') {
    await centerAuth.refresh()
    if (authPhase(centerAuth) !== 'authenticated') return
  }
  await managedRuntime.refresh()
  if (managedRuntime.imReady) await connectIm()
}

function authPhase(centerAuth: RefreshableCenterAuth): CenterAuthPhase {
  return centerAuth.state.phase
}
