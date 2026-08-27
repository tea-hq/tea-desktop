import { describe, expect, it } from 'vitest'

import { TeaPreset, teaDesignTokens } from './teaPreset'

describe('TeaPreset', () => {
  it('defines the semantic visual contract on a four pixel grid', () => {
    expect(teaDesignTokens.spacing).toEqual({
      base: '0.25rem',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
    })
    expect(teaDesignTokens.control).toMatchObject({
      compactHeight: '2rem',
      defaultHeight: '2.25rem',
      primaryHeight: '2.5rem',
    })
  })

  it('defines typography, radii, focus, status, surfaces, and one overlay elevation', () => {
    expect(teaDesignTokens.typography.bodySize).toBe('0.875rem')
    expect(teaDesignTokens.typography.monoFamily).toContain('JetBrains Mono')
    expect(teaDesignTokens.radius).toEqual({
      control: '0.375rem',
      overlay: '0.5rem',
      structural: '0.125rem',
    })
    expect(teaDesignTokens.focus).toEqual({
      color: '#0f6cbd',
      offset: '2px',
      width: '2px',
    })
    expect(teaDesignTokens.status).toEqual({
      danger: '#c50f1f',
      info: '#0f6cbd',
      success: '#107c10',
      warning: '#8a4b08',
    })
    expect(teaDesignTokens.surface.canvas).toBe('#ffffff')
    expect(teaDesignTokens.surface.subtle).toBe('#f5f5f5')
    expect(Object.keys(teaDesignTokens.elevation)).toEqual(['overlay'])
  })

  it('extends Aura with Tea semantic and component tokens', () => {
    expect(TeaPreset).toMatchObject({
      semantic: {
        typography: { fontSize: '0.875rem' },
        focusRing: { width: '2px', color: '#0f6cbd' },
      },
      components: {
        button: {
          root: { borderRadius: '{tea.radius.control}' },
        },
      },
    })
  })
})
