export interface FloatingMenuRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface FloatingMenuSize {
  width: number
  height: number
}

export interface FloatingMenuPosition {
  left: number
  top: number
}

const VIEWPORT_GUTTER = 8
const ANCHOR_GAP = 8

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

export function calculateFloatingMenuPosition(
  anchor: FloatingMenuRect,
  menu: FloatingMenuSize,
  viewport: FloatingMenuSize,
  options: { alignEnd: boolean; preferUp: boolean },
): FloatingMenuPosition {
  const preferredLeft = options.alignEnd ? anchor.right - menu.width : anchor.left
  const left = clamp(preferredLeft, VIEWPORT_GUTTER, viewport.width - menu.width - VIEWPORT_GUTTER)

  const topWhenDown = anchor.bottom + ANCHOR_GAP
  const topWhenUp = anchor.top - menu.height - ANCHOR_GAP
  const fitsBelow = topWhenDown + menu.height <= viewport.height - VIEWPORT_GUTTER
  const fitsAbove = topWhenUp >= VIEWPORT_GUTTER
  const openUp = options.preferUp ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove
  const preferredTop = openUp ? topWhenUp : topWhenDown
  const top = clamp(preferredTop, VIEWPORT_GUTTER, viewport.height - menu.height - VIEWPORT_GUTTER)

  return { left, top }
}
