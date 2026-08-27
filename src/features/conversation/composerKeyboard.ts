export interface ComposerKeyEvent {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode: number
}

export function shouldSendFromComposer(event: ComposerKeyEvent, compositionActive: boolean): boolean {
  if (compositionActive || event.isComposing || event.keyCode === 229) return false
  return event.key === 'Enter' && !event.shiftKey
}
