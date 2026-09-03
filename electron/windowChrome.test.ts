import { describe, expect, it, vi } from 'vitest'

import { applyWindowChromeTheme, createWindowChromeOptions } from './windowChrome'
import { WINDOW_CHROME_HEIGHT } from '../src/types/windowChrome'

describe('window chrome', () => {
  it.each([
    ['light', '#ffffff'],
    ['dark', '#111111'],
  ] as const)('creates macOS hidden titlebar options for %s theme', (theme, backgroundColor) => {
    expect(createWindowChromeOptions('darwin', theme)).toEqual({
      backgroundColor,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 16 },
    })
  })

  it.each(['win32', 'linux'] as const)('creates an overlay for %s', (platform) => {
    expect(createWindowChromeOptions(platform, 'dark')).toEqual({
      backgroundColor: '#111111',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#111111',
        symbolColor: '#f5f5f5',
        height: WINDOW_CHROME_HEIGHT,
      },
    })
  })

  it('updates the native overlay when the effective theme changes', () => {
    const target = { setTitleBarOverlay: vi.fn() }

    applyWindowChromeTheme(target, 'win32', 'light')

    expect(target.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#ffffff',
      symbolColor: '#111111',
      height: WINDOW_CHROME_HEIGHT,
    })
  })

  it('does not update an overlay on macOS', () => {
    const target = { setTitleBarOverlay: vi.fn() }

    applyWindowChromeTheme(target, 'darwin', 'dark')

    expect(target.setTitleBarOverlay).not.toHaveBeenCalled()
  })
})
