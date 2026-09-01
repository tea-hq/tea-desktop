import { THEME_PREFERENCES, type EffectiveTheme, type ThemePreference } from '@/types/theme'

export { THEME_PREFERENCES }
export type { EffectiveTheme, ThemePreference } from '@/types/theme'

export interface ThemeController {
  apply(preference: ThemePreference): EffectiveTheme
  effectiveTheme(): EffectiveTheme
  dispose(): void
}

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

export function createThemeController(): ThemeController {
  let preference: ThemePreference = 'system'
  let effective: EffectiveTheme = 'light'
  let mediaQuery: MediaQueryList | null = null
  let listening = false

  function resolveSystemTheme(): EffectiveTheme {
    try {
      const matches = mediaQuery
        ? mediaQuery.matches
        : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia(DARK_MODE_QUERY).matches
          : false
      return matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  }

  function applyRootTheme(theme: EffectiveTheme): void {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }

  function handleSystemThemeChange(): void {
    if (preference !== 'system') return
    effective = resolveSystemTheme()
    applyRootTheme(effective)
  }

  function stopListening(): void {
    if (!mediaQuery || !listening) return
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(handleSystemThemeChange)
    }
    listening = false
  }

  function startListening(): void {
    if (listening) return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      mediaQuery = null
      return
    }
    try {
      mediaQuery = window.matchMedia(DARK_MODE_QUERY)
    } catch {
      mediaQuery = null
      return
    }
    if (!mediaQuery) return
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleSystemThemeChange)
    } else {
      mediaQuery = null
      return
    }
    listening = true
  }

  return {
    apply(nextPreference) {
      preference = nextPreference
      if (nextPreference === 'system') {
        startListening()
        effective = resolveSystemTheme()
      } else {
        stopListening()
        effective = nextPreference
      }
      applyRootTheme(effective)
      return effective
    },

    effectiveTheme() {
      return effective
    },

    dispose() {
      stopListening()
      mediaQuery = null
    },
  }
}
