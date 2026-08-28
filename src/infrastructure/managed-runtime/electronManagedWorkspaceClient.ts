import { invoke, listen } from '../electronBridge'

import {
  INACTIVE_MANAGED_STATE,
  type ManagedWorkspaceClient,
  type ManagedWorkspaceState,
} from '@/features/managed-runtime/contracts'

export class ElectronManagedWorkspaceClient implements ManagedWorkspaceClient {
  async state(): Promise<ManagedWorkspaceState> {
    if (!hasElectronBridge()) return structuredClone(INACTIVE_MANAGED_STATE)
    return invoke<ManagedWorkspaceState>('get_managed_workspace_state')
  }

  async refresh(): Promise<ManagedWorkspaceState> {
    if (!hasElectronBridge()) return structuredClone(INACTIVE_MANAGED_STATE)
    return invoke<ManagedWorkspaceState>('refresh_managed_workspace')
  }

  async onStateChanged(listener: (state: ManagedWorkspaceState) => void): Promise<() => void> {
    if (!hasElectronBridge()) return () => undefined
    return listen('managed-workspace-state-changed', (event) => listener(event.payload))
  }
}

function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.teaDesktop)
}
