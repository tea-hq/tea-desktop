export const DESKTOP_COMMANDS = [
  'resolve_center_enterprise',
  'start_center_login',
  'cancel_center_login',
  'get_center_auth_state',
  'refresh_center_bootstrap',
  'list_center_directory_users',
  'logout_center',
  'get_managed_workspace_state',
  'refresh_managed_workspace',
  'get_managed_im_credentials',
  'list_credentials',
  'save_plugin_credentials',
  'clear_plugin_credentials',
  'invoke_plugin_action',
  'list_plugins',
  'enable_plugin',
  'disable_plugin',
  'list_skills',
  'list_agent_roles',
  'save_agent_role_revision',
  'get_agent_role_cache',
  'sync_agent_roles',
  'list_conversation_runtimes',
  'list_cloud_runner_tags',
  'list_cloud_runner_tokens',
  'reset_personal_runner_token',
  'create_cloud_runner_registration_command',
  'list_conversations',
  'get_conversation',
  'load_conversation_history',
  'create_conversation',
  'relocate_conversation_workspace',
  'send_message',
  'append_conversation_sources',
  'create_channel_draft',
  'update_channel_draft',
  'prepare_draft_delivery',
  'mark_draft_delivery_sending',
  'complete_draft_delivery',
  'fail_draft_delivery',
  'cancel_conversation',
  'respond_to_approval',
  'resolve_host_tool_call',
  'rename_conversation',
  'archive_conversation',
  'delete_conversation',
  'get_settings',
  'update_settings',
  'select_directory',
  'get_channel_descriptor',
  'get_channel_status',
  'get_channel_self_profile',
  'get_channel_user_profiles',
  'open_direct_conversation',
  'reconnect_channel',
  'disconnect_channel',
  'list_channels',
  'get_channel_details',
  'list_channel_members',
  'create_channel_group',
  'update_channel_group',
  'invite_channel_group_members',
  'remove_channel_group_members',
  'leave_channel_group',
  'dismiss_channel_group',
  'set_channel_group_member_role',
  'set_channel_group_member_mute',
  'load_channel_messages',
  'search_channel_messages',
  'list_pinned_channel_messages',
  'save_channel_message',
  'list_saved_channel_messages',
  'remove_saved_channel_message',
  'send_channel_message',
  'reply_channel_message',
  'forward_channel_message',
  'load_merged_channel_messages',
  'modify_channel_message',
  'delete_channel_messages',
  'revoke_channel_message',
  'pin_channel_message',
  'quick_comment_channel_message',
  'cancel_channel_message_send',
  'select_channel_attachments',
  'mark_channel_read',
] as const

export type DesktopCommand = (typeof DESKTOP_COMMANDS)[number]

export const DESKTOP_EVENTS = [
  'center-auth-state-changed',
  'managed-workspace-state-changed',
  'channel-event',
  'conversation:event',
  'conversation:host-tool-call',
  'conversation:updated',
] as const

export type DesktopEvent = (typeof DESKTOP_EVENTS)[number]

export interface DesktopEventPayloadMap {
  'center-auth-state-changed': CenterAuthState
  'managed-workspace-state-changed': ManagedWorkspaceState
  'channel-event': ChannelEvent
  'conversation:event': ConversationEvent
  'conversation:host-tool-call': HostToolCall
  'conversation:updated': ConversationSummary
}

export interface DesktopCommandError {
  code: string
  retryable: boolean
  message?: string
}

export type DesktopCommandResult<T> =
  { ok: true; value: T } | { ok: false; error: DesktopCommandError }

export interface TeaDesktopBridge {
  setWindowTheme(theme: EffectiveTheme): void
  invoke<T = unknown>(command: DesktopCommand, args?: unknown): Promise<T>
  on<Event extends DesktopEvent>(
    event: Event,
    listener: (payload: DesktopEventPayloadMap[Event]) => void,
  ): () => void
}

export function unwrapDesktopCommandResult<T>(value: unknown): T {
  if (!isRecord(value) || typeof value.ok !== 'boolean') throw transportFailure()
  if (value.ok === true && 'value' in value) return value.value as T
  if (value.ok === false && isDesktopCommandError(value.error)) throw value.error
  throw transportFailure()
}

function isDesktopCommandError(value: unknown): value is DesktopCommandError {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value.code) &&
    typeof value.retryable === 'boolean' &&
    (value.message === undefined || typeof value.message === 'string')
  )
}

function transportFailure(): DesktopCommandError {
  return { code: 'transportFailure', retryable: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
import type { CenterAuthState } from '../features/auth/contracts'
import type { ChannelEvent } from '../features/channels/contracts'
import type {
  ConversationEvent,
  ConversationSummary,
  HostToolCall,
} from '../features/conversation/contracts'
import type { ManagedWorkspaceState } from '../features/managed-runtime/contracts'
import type { EffectiveTheme } from './theme'
