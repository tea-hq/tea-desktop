export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type EffectiveTheme = Exclude<ThemePreference, 'system'>

export function isEffectiveTheme(value: unknown): value is EffectiveTheme {
  return value === 'light' || value === 'dark'
}
