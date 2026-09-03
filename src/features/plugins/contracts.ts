export interface PluginAction {
  id: string
  version: string
  description: string
  effect: 'read' | 'write'
}

export type PluginSource = 'local' | 'remote'

export interface PluginConnection {
  id: string
  displayName: string
  enabled: boolean
  configured?: boolean
}

export interface PluginRecord {
  id: string
  version: string
  displayName: string
  description?: string
  enabled: boolean
  actions: PluginAction[]
  connections: PluginConnection[]
  source?: PluginSource
  iconUrl?: string
  sourceFormat?: string
  baseUrl?: string
  credentialConfigured?: boolean
  createdAt?: string
  updatedAt?: string
  /** Main-process-only metadata populated by the local plugin catalog. */
  executable?: string
}

export interface PluginClient {
  list(): Promise<PluginRecord[]>
  listRemote?(): Promise<PluginRecord[]>
  enable(pluginId: string): Promise<void>
  disable(pluginId: string): Promise<void>
}
