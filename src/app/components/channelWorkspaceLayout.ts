import type { ChannelConnectionPhase } from '@/features/channels/contracts'

export type ChannelWorkspacePanel = 'thread' | 'selection' | 'connection' | 'none'

export interface ChannelWorkspacePanelInput {
  hasActiveChannel: boolean
  hasThreadRoot: boolean
  statusPhase: ChannelConnectionPhase
  channelCount: number
}

/** Resolves the single optional panel that may follow the channel timeline. */
export function resolveChannelWorkspacePanel(
  input: ChannelWorkspacePanelInput,
): ChannelWorkspacePanel {
  if (input.hasActiveChannel && input.hasThreadRoot) return 'thread'
  if (!input.hasActiveChannel && input.statusPhase === 'connected' && input.channelCount > 0)
    return 'selection'
  if (!input.hasActiveChannel) return 'connection'
  return 'none'
}
