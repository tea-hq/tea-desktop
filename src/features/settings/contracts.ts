import type { ThemePreference } from '@/types/theme'

export type { ThemePreference } from '@/types/theme'

export type LocalePreference = 'system' | 'en' | 'zh-CN'
export type NotificationPreviewPreference = 'message' | 'sender' | 'hidden'

export interface NotificationSettings {
  enabled: boolean
  sound: boolean
  preview: NotificationPreviewPreference
}

export interface AppSettings {
  locale: LocalePreference
  theme: ThemePreference
  notifications: NotificationSettings
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
  notifications: {
    enabled: true,
    sound: true,
    preview: 'message',
  },
  conversationDefaults: {
    runtimeId: 'external.claude',
    model: null,
  },
  layout: {
    leftSidebarOpen: true,
    agentDrawerOpen: false,
  },
}
