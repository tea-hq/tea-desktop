import { hasElectronBridge, invoke } from '../electronBridge'

import type {
  CredentialClient,
  CredentialMutation,
  CredentialRecord,
} from '@/features/credentials/contracts'

export class ElectronCredentialClient implements CredentialClient {
  async list(): Promise<CredentialRecord[]> {
    if (!hasElectronBridge()) return []
    return invoke<CredentialRecord[]>('list_credentials')
  }
  async save(mutation: CredentialMutation): Promise<CredentialRecord> {
    if (!hasElectronBridge())
      return {
        pluginId: mutation.pluginId,
        connectionId: mutation.connectionId,
        configured: true,
        updatedAt: mutation.updatedAt,
      }
    return invoke<CredentialRecord>('save_plugin_credentials', { mutation })
  }
  async clear(pluginId: string, connectionId: string): Promise<void> {
    if (hasElectronBridge()) await invoke('clear_plugin_credentials', { pluginId, connectionId })
  }
}
