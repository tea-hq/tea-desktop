import type { ComposerAttachment, PermissionMode } from '@/features/conversation/contracts'
import type { ChannelBinding, ChannelSourceInput } from '@/types/channelCollaboration'

export type AgentDrawerPhase = 'index' | 'preparing' | 'creating' | 'active'
export type AgentSessionListMode = 'recent' | 'all'

export interface AgentDrawerDraft {
  runtimeId: string | null
  model: string
  permissionMode: PermissionMode
  roleId: string | null
  text: string
  attachments: ComposerAttachment[]
  sources: ChannelSourceInput[]
  creationIdempotencyKey: string
  conversationId: string | null
}

export interface AgentDrawerChannelState {
  binding: ChannelBinding
  phase: AgentDrawerPhase
  listMode: AgentSessionListMode
  query: string
  scrollOffset: number
  selectedConversationId: string | null
  draft: AgentDrawerDraft
}

export function serializeChannelBinding(binding: ChannelBinding): string {
  return JSON.stringify([binding.transportId, binding.accountRef, binding.channelRef])
}
