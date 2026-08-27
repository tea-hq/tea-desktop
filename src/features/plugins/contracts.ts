export interface PluginAction {
  id: string
  version: string
  description: string
  effect: 'read' | 'write'
}

export interface PluginRecord {
  id: string
  version: string
  displayName: string
  description?: string
  enabled: boolean
  actions: PluginAction[]
  connections: Array<{ id: string; displayName: string; enabled: boolean }>
  /** Main-process-only metadata populated by the local plugin catalog. */
  executable?: string
}

export interface PluginClient {
  list(): Promise<PluginRecord[]>
  enable(pluginId: string): Promise<void>
  disable(pluginId: string): Promise<void>
}
