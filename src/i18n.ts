import { createI18n } from 'vue-i18n'

import type { LocalePreference } from '@/features/settings/contracts'
import en from './locales/en'
import zhCN from './locales/zh-CN'

export type AppLocale = 'en' | 'zh-CN'

export function normalizeLocale(locale: string | null | undefined): AppLocale {
  return locale?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function resolveLocale(preference: LocalePreference): AppLocale {
  if (preference !== 'system') return preference
  return normalizeLocale(typeof navigator === 'undefined' ? undefined : navigator.language)
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveLocale('system'),
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
  },
})

export function applyLocalePreference(preference: LocalePreference): void {
  const locale = resolveLocale(preference)
  i18n.global.locale.value = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

applyLocalePreference('system')
