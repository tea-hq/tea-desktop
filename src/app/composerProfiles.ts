export interface ComposerProfile {
  readonly id: 'full' | 'drawer'
  readonly compact: boolean
  readonly showHeaderRuntime: boolean
  readonly showSources: boolean
  readonly maxAttachments: number
}

export const fullAgentProfile = Object.freeze<ComposerProfile>({
  id: 'full',
  compact: false,
  showHeaderRuntime: true,
  showSources: true,
  maxAttachments: 12,
})

export const drawerAgentProfile = Object.freeze<ComposerProfile>({
  id: 'drawer',
  compact: true,
  showHeaderRuntime: false,
  showSources: true,
  maxAttachments: 8,
})

export function isComposerProfile(value: unknown): value is ComposerProfile {
  return value === fullAgentProfile || value === drawerAgentProfile
}
