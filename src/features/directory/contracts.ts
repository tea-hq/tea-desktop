export type DirectoryPhase = 'idle' | 'loading' | 'ready' | 'stale' | 'unavailable' | 'error'

export interface DirectoryUser {
  tenant: { id: string; domain: string; displayName: string }
  center: { userId: string; displayName: string }
  oidc: { subject: string; preferredUsername: string; email?: string; emailVerified: boolean; avatarUrl?: string }
  im?: { provider: string; account?: string; status: string }
}

export interface DirectoryClient { listUsers(): Promise<{ schemaVersion: number; users: DirectoryUser[] }> }
