export interface CredentialRecord {
  pluginId: string
  connectionId: string
  configured: boolean
  updatedAt: number
}

export interface CredentialMutation {
  pluginId: string
  connectionId: string
  value: Record<string, unknown>
  updatedAt: number
}

export interface CredentialClient {
  list(): Promise<CredentialRecord[]>
  save(mutation: CredentialMutation): Promise<CredentialRecord>
  clear(pluginId: string, connectionId: string): Promise<void>
}
