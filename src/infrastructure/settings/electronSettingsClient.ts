import { invoke } from '../electronBridge'

import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type SettingsClient,
} from '@/features/settings/contracts'

export class ElectronSettingsClient implements SettingsClient {
  async getSettings(): Promise<AppSettings> {
    if (!hasElectronBridge()) return structuredClone(DEFAULT_SETTINGS)
    return invoke<AppSettings>('get_settings')
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    if (!hasElectronBridge()) return structuredClone(settings)
    return invoke<AppSettings>('update_settings', { settings })
  }
}

function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.teaDesktop)
}
