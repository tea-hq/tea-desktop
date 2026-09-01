// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createThemeController, type ThemePreference } from './themeController'

interface MediaQueryMock {
  matches: boolean
  listeners: Array<(event: MediaQueryListEvent) => void>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  emit(matches: boolean): void
}

interface LegacyMediaQueryMock {
  matches: boolean
  listeners: Array<(event: MediaQueryListEvent) => void>
  addListener: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  emit(matches: boolean): void
}

function createMediaQueryMock(matches = false): MediaQueryMock {
  const media: MediaQueryMock = {
    matches,
    listeners: [],
    addEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
      media.listeners.push(listener)
    }),
    removeEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
      media.listeners = media.listeners.filter((candidate) => candidate !== listener)
    }),
    emit(nextMatches: boolean) {
      media.matches = nextMatches
      for (const listener of [...media.listeners])
        listener({ matches: nextMatches } as MediaQueryListEvent)
    },
  }
  return media
}

function createLegacyMediaQueryMock(matches = false): LegacyMediaQueryMock {
  const media: LegacyMediaQueryMock = {
    matches,
    listeners: [],
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      media.listeners.push(listener)
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      media.listeners = media.listeners.filter((candidate) => candidate !== listener)
    }),
    emit(nextMatches: boolean) {
      media.matches = nextMatches
      for (const listener of [...media.listeners])
        listener({ matches: nextMatches } as MediaQueryListEvent)
    },
  }
  return media
}

describe('createThemeController', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    vi.restoreAllMocks()
  })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
  ] as const)('applies an explicit %s preference', (preference, expected) => {
    const controller = createThemeController()

    expect(controller.apply(preference)).toBe(expected)
    expect(controller.effectiveTheme()).toBe(expected)
    expect(document.documentElement.dataset.theme).toBe(expected)
    expect(document.documentElement.style.colorScheme).toBe(expected)
  })

  it.each([
    [false, 'light'],
    [true, 'dark'],
  ] as const)('resolves system preference from matchMedia (%s)', (matches, expected) => {
    const media = createMediaQueryMock(matches)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const controller = createThemeController()

    expect(controller.apply('system')).toBe(expected)
    expect(media.addEventListener).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.theme).toBe(expected)
  })

  it('updates system mode when the media query changes', () => {
    const media = createMediaQueryMock(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const controller = createThemeController()

    controller.apply('system')
    media.emit(true)

    expect(controller.effectiveTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('ignores system changes after an explicit preference is selected', () => {
    const media = createMediaQueryMock(true)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const controller = createThemeController()

    controller.apply('system')
    controller.apply('light')
    media.emit(true)

    expect(controller.effectiveTheme()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(media.removeEventListener).toHaveBeenCalledOnce()
  })

  it('does not register duplicate listeners when system mode is reapplied', () => {
    const media = createMediaQueryMock(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const controller = createThemeController()

    controller.apply('system')
    controller.apply('system')

    expect(media.addEventListener).toHaveBeenCalledOnce()
    expect(media.listeners).toHaveLength(1)
  })

  it('removes listeners on dispose', () => {
    const media = createMediaQueryMock(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const controller = createThemeController()

    controller.apply('system')
    controller.dispose()
    media.emit(true)

    expect(media.removeEventListener).toHaveBeenCalledOnce()
    expect(controller.effectiveTheme()).toBe('light')
  })

  it('supports legacy media-query listener APIs', () => {
    const media = createLegacyMediaQueryMock(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    const controller = createThemeController()

    controller.apply('system')
    media.emit(true)
    controller.dispose()

    expect(controller.effectiveTheme()).toBe('dark')
    expect(media.addListener).toHaveBeenCalledOnce()
    expect(media.removeListener).toHaveBeenCalledOnce()
  })

  it('falls back safely when matchMedia returns no listener API', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const controller = createThemeController()

    expect(controller.apply('system')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const controller = createThemeController()

    expect(controller.apply('system')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('remains safe without a document', () => {
    const originalDocument = globalThis.document
    vi.stubGlobal('document', undefined)
    const controller = createThemeController()

    expect(controller.apply('dark')).toBe('dark')
    expect(controller.effectiveTheme()).toBe('dark')

    vi.stubGlobal('document', originalDocument)
  })

  it('accepts only the theme preference contract at compile time', () => {
    const preferences: ThemePreference[] = ['system', 'light', 'dark']
    expect(preferences).toHaveLength(3)
  })
})
