import { describe, expect, it } from 'vitest'

import { teaDesignTokens } from './teaTokens'

describe('Tea design tokens', () => {
  it('keeps the spacing, control, and radius scales explicit', () => {
    expect(teaDesignTokens.spacing).toEqual({
      base: '0.25rem',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
    })
    expect(teaDesignTokens.control).toEqual({
      compactHeight: '2rem',
      defaultHeight: '2.25rem',
      primaryHeight: '2.5rem',
    })
    expect(teaDesignTokens.radius).toEqual({ structural: '8px', control: '12px', overlay: '16px' })
  })

  it('defines the semantic color and overlay contract', () => {
    expect(teaDesignTokens.colors).toMatchObject({
      accent: '#4f9d35',
      canvas: '#ffffff',
      panel: '#f6f6f6',
    })
    expect(teaDesignTokens.elevation).toEqual({ overlay: '0 8px 24px rgb(0 0 0 / 10%)' })
  })
})
