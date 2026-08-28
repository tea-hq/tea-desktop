import { invoke, listen } from '../electronBridge'

import type {
  CenterAuthClient,
  CenterAuthInitialization,
  CenterAuthState,
  EnterpriseDirectory,
} from '@/features/auth/contracts'
import { SIGNED_OUT_STATE } from '@/features/auth/contracts'

function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.teaDesktop)
}

export class ElectronCenterAuthClient implements CenterAuthClient {
  async initialize(): Promise<CenterAuthInitialization> {
    if (!hasElectronBridge())
      return { state: structuredClone(SIGNED_OUT_STATE), defaultEnterpriseDomain: null }
    return invoke<CenterAuthInitialization>('get_center_auth_state')
  }

  async resolveEnterprise(domain: string): Promise<EnterpriseDirectory> {
    if (!hasElectronBridge()) throw { code: 'centerUnavailable', retryable: true }
    return invoke<EnterpriseDirectory>('resolve_center_enterprise', { domain })
  }

  async startLogin(domain: string): Promise<CenterAuthState> {
    if (!hasElectronBridge()) throw { code: 'centerUnavailable', retryable: true }
    return invoke<CenterAuthState>('start_center_login', { domain })
  }

  async cancelLogin(): Promise<CenterAuthState> {
    if (!hasElectronBridge())
      return { ...structuredClone(SIGNED_OUT_STATE), errorCode: 'loginCancelled' }
    return invoke<CenterAuthState>('cancel_center_login')
  }

  async refreshBootstrap(): Promise<CenterAuthState> {
    return invoke<CenterAuthState>('refresh_center_bootstrap')
  }

  async logout(): Promise<CenterAuthState> {
    if (!hasElectronBridge()) return structuredClone(SIGNED_OUT_STATE)
    return invoke<CenterAuthState>('logout_center')
  }

  async onStateChanged(listener: (state: CenterAuthState) => void): Promise<() => void> {
    if (!hasElectronBridge()) return () => undefined
    return listen('center-auth-state-changed', (event) => listener(event.payload))
  }
}
