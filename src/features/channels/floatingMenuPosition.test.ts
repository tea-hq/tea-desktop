import { describe, expect, it } from 'vitest'

import { calculateFloatingMenuPosition } from './floatingMenuPosition'

const viewport = { width: 800, height: 600 }
const menu = { width: 288, height: 280 }

describe('calculateFloatingMenuPosition', () => {
  it('opens below and aligns to the leading edge when space is available', () => {
    expect(calculateFloatingMenuPosition(
      { left: 120, right: 148, top: 100, bottom: 128 },
      menu,
      viewport,
      { alignEnd: false, preferUp: false },
    )).toEqual({ left: 120, top: 136 })
  })

  it('keeps the menu inside the right viewport edge', () => {
    expect(calculateFloatingMenuPosition(
      { left: 720, right: 748, top: 100, bottom: 128 },
      menu,
      viewport,
      { alignEnd: false, preferUp: false },
    )).toEqual({ left: 504, top: 136 })
  })

  it('flips upward when there is not enough room below', () => {
    expect(calculateFloatingMenuPosition(
      { left: 300, right: 328, top: 500, bottom: 528 },
      menu,
      viewport,
      { alignEnd: false, preferUp: false },
    )).toEqual({ left: 300, top: 212 })
  })

  it('clamps oversized positions to the viewport gutter', () => {
    expect(calculateFloatingMenuPosition(
      { left: -40, right: -12, top: 4, bottom: 32 },
      menu,
      viewport,
      { alignEnd: true, preferUp: true },
    )).toEqual({ left: 8, top: 40 })
  })
})
