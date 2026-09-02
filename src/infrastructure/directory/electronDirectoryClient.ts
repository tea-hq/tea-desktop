import { hasElectronBridge, invoke } from '../electronBridge'
import type { DirectoryClient, DirectoryListOptions } from '@/features/directory/contracts'

export class ElectronDirectoryClient implements DirectoryClient {
  async listUsers(options?: DirectoryListOptions): Promise<{
    schemaVersion: number
    users: import('@/features/directory/contracts').DirectoryUser[]
  }> {
    if (import.meta.env.DEV && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('tea.directory.mock')
      if (raw) {
        try {
          const value = JSON.parse(raw)
          if (value?.schemaVersion === 1 && Array.isArray(value.users)) return value
        } catch {
          localStorage.removeItem('tea.directory.mock')
        }
      }
    }
    if (!hasElectronBridge()) {
      return { schemaVersion: 1, users: [] }
    }
    return invoke('list_center_directory_users', options)
  }
}
