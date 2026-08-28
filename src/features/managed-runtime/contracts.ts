export type RuntimeResourceStatus = 'ready' | 'disabled' | 'unavailable'
export type ManagedWorkspacePhase =
  'inactive' | 'preparing' | 'ready' | 'degraded' | 'offline' | 'failed'

export interface ManagedResourceState {
  status: RuntimeResourceStatus
  errorCode?: string
}

export interface ManagedModelState {
  id: string
  displayName: string
  selectionValue: string
}

export interface ManagedModelProviderState {
  id: string
  kind: string
  displayName: string
  status: RuntimeResourceStatus
  errorCode?: string
  models: ManagedModelState[]
}

export interface ManagedWorkspaceState {
  generation: number
  phase: ManagedWorkspacePhase
  tenantId?: string
  userId?: string
  im?: ManagedResourceState
  modelProviders: ManagedModelProviderState[]
  errorCode?: string
}

export interface ManagedWorkspaceClient {
  state(): Promise<ManagedWorkspaceState>
  refresh(): Promise<ManagedWorkspaceState>
  onStateChanged(listener: (state: ManagedWorkspaceState) => void): Promise<() => void>
}

export const INACTIVE_MANAGED_STATE: ManagedWorkspaceState = {
  generation: 0,
  phase: 'inactive',
  modelProviders: [],
}
