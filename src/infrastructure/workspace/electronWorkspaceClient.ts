import { hasElectronBridge, invoke } from '../electronBridge'

export interface WorkspaceClient {
  selectDirectory(): Promise<string | null>
}

export class ElectronWorkspaceClient implements WorkspaceClient {
  async selectDirectory(): Promise<string | null> {
    if (!hasElectronBridge()) return null
    return invoke<string | null>('select_directory')
  }
}
