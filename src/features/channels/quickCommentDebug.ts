const quickCommentDebugEnabled =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_QUICK_COMMENT === 'true'

export function debugQuickComment(stage: string, details: Record<string, unknown> = {}): void {
  if (!quickCommentDebugEnabled) return
  let serialized = ''
  try {
    serialized = JSON.stringify(details)
  } catch {
    serialized = '[unserializable details]'
  }
  console.info(`[Tea][quick-comment] ${stage}${serialized ? ` ${serialized}` : ''}`)
}
