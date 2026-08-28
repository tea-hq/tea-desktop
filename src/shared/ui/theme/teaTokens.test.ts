import { describe, expect, it } from 'vitest'

import { teaDesignTokens } from './teaTokens'

describe('Tea design tokens', () => {
  it('keeps the spacing, control, and radius scales explicit', () => {
    expect(teaDesignTokens.spacing).toEqual({
      base: '0.25rem',
      xxs: '0.25rem',
      xs: '0.5rem',
      sm: '0.75rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem',
      xxl: '3rem',
      section: '6rem',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
    })
    expect(teaDesignTokens.control).toEqual({
      compactHeight: '2.25rem',
      defaultHeight: '2.5rem',
      primaryHeight: '2.5rem',
    })
    expect(teaDesignTokens.radius).toEqual({
      menu: '8px',
      inline: '6px',
      card: '12px',
      control: '8px',
      pill: '9999px',
      overlay: '12px',
    })
  })

  it('defines the semantic color and overlay contract', () => {
    expect(teaDesignTokens.colors).toMatchObject({
      accent: '#111111',
      canvas: '#ffffff',
      panel: '#f8f9fa',
      lineSoft: '#f3f4f6',
      focus: 'rgb(59 130 246 / 50%)',
    })
    expect(teaDesignTokens.elevation).toEqual({ overlay: 'none' })
  })
})
