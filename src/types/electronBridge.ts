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
  'list_conversations',
  'get_conversation',
  'load_conversation_history',
  'create_conversation',
  'send_message',
  'configure_conversation_host_tools',
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
  'get_channel_descriptor',
  'get_channel_status',
  'get_channel_self_profile',
  'open_direct_conversation',
  'reconnect_channel',
  'disconnect_channel',
  'list_channels',
  'load_channel_messages',
  'send_channel_message',
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

export interface TeaDesktopBridge {
  invoke<T = unknown>(command: DesktopCommand, args?: unknown): Promise<T>
  on<T = unknown>(event: DesktopEvent, listener: (payload: T) => void): () => void
}
