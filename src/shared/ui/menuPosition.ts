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

export interface FloatingMenuPositionOptions {
  alignEnd: boolean
  preferUp: boolean
  gap?: number
  gutter?: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

export function calculateFloatingMenuPosition(
  anchor: FloatingMenuRect,
  menu: FloatingMenuSize,
  viewport: FloatingMenuSize,
  options: FloatingMenuPositionOptions,
): FloatingMenuPosition {
  const gutter = options.gutter ?? 8
  const gap = options.gap ?? 8
  const preferredLeft = options.alignEnd ? anchor.right - menu.width : anchor.left
  const left = clamp(preferredLeft, gutter, viewport.width - menu.width - gutter)

  const topWhenDown = anchor.bottom + gap
  const topWhenUp = anchor.top - menu.height - gap
  const fitsBelow = topWhenDown + menu.height <= viewport.height - gutter
  const fitsAbove = topWhenUp >= gutter
  const openUp = options.preferUp ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove
  const preferredTop = openUp ? topWhenUp : topWhenDown
  const top = clamp(preferredTop, gutter, viewport.height - menu.height - gutter)

  return { left, top }
}
