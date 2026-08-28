import { describe, expect, it } from 'vitest'

import { teaDesignTokens } from './teaTokens'

describe('Tea design tokens', () => {
  it('keeps the spacing, control, and radius scales explicit', () => {
    expect(teaDesignTokens.spacing).toEqual({
      base: '0.5rem',
      xxs: '0.125rem',
      xs: '0.25rem',
      sm: '0.5rem',
      md: '0.75rem',
      lg: '1rem',
      xl: '1.5rem',
      xxl: '2rem',
      section: '5.5rem',
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
      control: '9999px',
      overlay: '12px',
    })
  })

  it('defines the semantic color and overlay contract', () => {
    expect(teaDesignTokens.colors).toMatchObject({
      accent: '#000000',
      canvas: '#ffffff',
      panel: '#fafafa',
      focus: 'rgb(59 130 246 / 50%)',
    })
    expect(teaDesignTokens.elevation).toEqual({ overlay: 'none' })
  })
})
