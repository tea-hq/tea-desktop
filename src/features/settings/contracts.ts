export type LocalePreference = 'system' | 'en' | 'zh-CN'

export interface AppSettings {
  locale: LocalePreference
  conversationDefaults: {
    runtimeId: string
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
  conversationDefaults: {
    runtimeId: 'builtin.tea',
  },
  layout: {
    leftSidebarOpen: true,
    agentDrawerOpen: false,
  },
}
