export type CenterAuthPhase =
  | 'signedOut'
  | 'resolving'
  | 'browserPending'
  | 'exchanging'
  | 'authenticated'
  | 'offlineCached'
  | 'recoveryRequired'

export type CenterAuthErrorCode =
  | 'invalidRequest'
  | 'organizationUnavailable'
  | 'centerUnavailable'
  | 'invalidCallback'
  | 'callbackExpired'
  | 'loginCancelled'
  | 'storageFailure'
  | 'recoveryRequired'
  | 'authorizationDenied'
  | 'protocolFailure'
  | 'secureStorageUnavailable'

export interface EnterpriseDirectory {
  organizationDomain: string
  displayName: string
  loginAvailable: boolean
}

export interface EndpointBootstrap {
  schemaVersion: number
  revision: number
  generatedAt: string
  tenant: { id: string; domain: string; displayName: string }
  user: {
    id: string
    displayName: string
    preferredUsername: string
    email: string
    emailVerified: boolean
    avatarUrl: string
    oidcSubject: string
  }
  im: { provider: string; appKey: string; accountStatus: string } | null
  modelProviders: Array<{
    id: string
    kind: string
    displayName: string
    enabled: boolean
    models: string[]
  }>
}

export interface CenterAuthState {
  generation: number
  phase: CenterAuthPhase
  enterprise: EnterpriseDirectory | null
  bootstrap: EndpointBootstrap | null
  lastValidatedAt: number | null
  errorCode: CenterAuthErrorCode | null
}

export interface CenterAuthInitialization {
  state: CenterAuthState
  defaultEnterpriseDomain: string | null
}

export interface CenterAuthClient {
  initialize(): Promise<CenterAuthInitialization>
  resolveEnterprise(domain: string): Promise<EnterpriseDirectory>
  startLogin(domain: string): Promise<CenterAuthState>
  cancelLogin(): Promise<CenterAuthState>
  refreshBootstrap(): Promise<CenterAuthState>
  logout(): Promise<CenterAuthState>
  onStateChanged(listener: (state: CenterAuthState) => void): Promise<() => void>
}

export const SIGNED_OUT_STATE: CenterAuthState = {
  generation: 0,
  phase: 'signedOut',
  enterprise: null,
  bootstrap: null,
  lastValidatedAt: null,
  errorCode: null,
}
