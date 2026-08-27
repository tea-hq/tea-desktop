import { hasElectronBridge, invoke } from '../electronBridge'

import type { PluginClient, PluginRecord } from '@/features/plugins/contracts'

export class ElectronPluginClient implements PluginClient {
  async list(): Promise<PluginRecord[]> {
    if (!hasElectronBridge()) return []
    return invoke<PluginRecord[]>('list_plugins')
  }
  async enable(pluginId: string): Promise<void> {
    if (hasElectronBridge()) await invoke('enable_plugin', { pluginId })
  }
  async disable(pluginId: string): Promise<void> {
    if (hasElectronBridge()) await invoke('disable_plugin', { pluginId })
  }
}
