import type { ThemePreference } from '@/types/theme'

export type { ThemePreference } from '@/types/theme'

export type LocalePreference = 'system' | 'en' | 'zh-CN'

export interface AppSettings {
  locale: LocalePreference
  theme: ThemePreference
  conversationDefaults: {
    runtimeId: string
    model: string | null
  }
  layout: {
    leftSidebarOpen: boolean
    agentDrawerOpen: boolean
  }
}

export interface SettingsClient {
  getSettings(): Promise<AppSettings>
  updateSettings(settings: AppSettings): Promise<AppSettings>
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'system',
  theme: 'system',
  conversationDefaults: {
    runtimeId: 'external.claude',
    model: null,
  },
  layout: {
    leftSidebarOpen: true,
    agentDrawerOpen: false,
  },
}
