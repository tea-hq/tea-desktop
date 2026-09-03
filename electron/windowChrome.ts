import type { EffectiveTheme } from '../src/types/theme'
import { WINDOW_CHROME_HEIGHT } from '../src/types/windowChrome'

const MACOS_TRAFFIC_LIGHT_SIZE = 16
const MACOS_TRAFFIC_LIGHT_POSITION = {
  x: 16,
  y: (WINDOW_CHROME_HEIGHT - MACOS_TRAFFIC_LIGHT_SIZE) / 2,
} as const

export interface WindowChromeOverlayOptions {
  readonly color: string
  readonly symbolColor: string
  readonly height: number
}

export interface WindowChromeOptions {
  readonly backgroundColor: string
  readonly titleBarStyle?: 'hidden'
  readonly trafficLightPosition?: { readonly x: number; readonly y: number }
  readonly titleBarOverlay?: WindowChromeOverlayOptions
}

export interface WindowChromeTarget {
  setTitleBarOverlay(options: WindowChromeOverlayOptions): void
}

const WINDOW_THEME_COLORS = {
  light: { backgroundColor: '#ffffff', symbolColor: '#111111' },
  dark: { backgroundColor: '#111111', symbolColor: '#f5f5f5' },
} as const satisfies Record<EffectiveTheme, { backgroundColor: string; symbolColor: string }>

export function createWindowChromeOptions(
  platform: NodeJS.Platform,
  theme: EffectiveTheme,
): WindowChromeOptions {
  const colors = colorsForTheme(theme)

  if (platform === 'darwin') {
    return {
      backgroundColor: colors.backgroundColor,
      titleBarStyle: 'hidden',
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    }
  }

  return {
    backgroundColor: colors.backgroundColor,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: colors.backgroundColor,
      symbolColor: colors.symbolColor,
      height: WINDOW_CHROME_HEIGHT,
    },
  }
}

export function applyWindowChromeTheme(
  target: WindowChromeTarget,
  platform: NodeJS.Platform,
  theme: EffectiveTheme,
): void {
  if (platform === 'darwin') return

  const colors = colorsForTheme(theme)
  target.setTitleBarOverlay({
    color: colors.backgroundColor,
    symbolColor: colors.symbolColor,
    height: WINDOW_CHROME_HEIGHT,
  })
}

function colorsForTheme(theme: EffectiveTheme): (typeof WINDOW_THEME_COLORS)[EffectiveTheme] {
  return theme === 'dark' ? WINDOW_THEME_COLORS.dark : WINDOW_THEME_COLORS.light
}
