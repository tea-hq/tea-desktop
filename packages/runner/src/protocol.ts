export const RUNNER_PROTOCOL_VERSION = 1 as const

export type RunnerTokenScope = 'tenant' | 'group' | 'user'
export type RunnerStatus = 'ready' | 'offline' | 'draining' | 'revoked'
export type ConversationStatus =
  | 'queued'
  | 'offered'
  | 'starting'
  | 'running'
  | 'running_offline'
  | 'waitingApproval'
  | 'completed'
  | 'failed'
  | 'cancel_requested'
  | 'cancelled'

export type RunnerPermissionDecision = 'allowOnce' | 'allowSession' | 'deny' | 'cancel'

export type RunnerMessageType =
  | 'host.hello'
  | 'runner.attach'
  | 'runner.attached'
  | 'runner.heartbeat'
  | 'runner.command'
  | 'runner.event'
  | 'runner.event.ack'
  | 'runner.resume'
  | 'runner.config.update'
  | 'runner.error'

export interface RunnerEnvelope<T = unknown> {
  version: typeof RUNNER_PROTOCOL_VERSION
  messageId: string
  correlationId?: string
  type: RunnerMessageType
  runnerId?: string
  localKey?: string
  instanceId?: string
  attachmentId?: string
  conversationId?: string
  assignmentId?: string
  assignmentEpoch?: number
  sequence?: number
  payload?: T
}

export interface HostHello {
  hostId: string
  clientVersion: string
}

/** The token is sent inside the TLS-protected first frame for each attachment. */
export interface RunnerAttach {
  localKey: string
  token: string
  displayName: string
  tags: string[]
  workspaceRoot: string
  limit?: number
}

export interface RunnerAttached {
  runnerId: string
  localKey: string
  attachmentId: string
  instanceId: string
  tags: string[]
  workspaceRoot: string
  limit: number
  epoch: number
}

export interface RunnerHeartbeat {
  activeConversations: number
  capacity: number
  limit?: number
}

export interface RunnerResume {
  assignments: Array<{
    conversationId: string
    assignmentId?: string
    assignmentEpoch: number
    lastEventSequence: number
  }>
}

export interface RunnerConfigUpdate {
  localKey: string
  concurrent?: number
  limit?: number
  tags?: string[]
}

export interface PluginRef {
  pluginId: string
  pluginVersion: string
  operationId: string
}

export interface RunnerCommand {
  command:
    | 'conversation.start'
    | 'conversation.prompt'
    | 'conversation.cancel'
    | 'conversation.permission.resolve'
  runtimeId: string
  providerId: string
  modelId: string
  text?: string
  workspaceRef: string
  workspacePath?: string
  leaseToken?: string
  pluginRefs?: PluginRef[]
  permissionMode?: string
  approvalId?: string
  decision?: RunnerPermissionDecision
}

export interface RunnerProviderLeaseRequest {
  leaseToken: string
  runtimeId: string
  providerId: string
  modelId: string
}

export interface RunnerProviderLeaseResponse {
  providerId: string
  kind: string
  displayName: string
  baseUrl: string
  apiKey: string
  modelId: string
  modelIds: string[]
}

export interface RunnerEvent {
  eventType: string
  data?: unknown
  terminal?: boolean
  errorCode?: string
  error?: string
}

export interface RunnerError {
  code: string
  message: string
}

export interface CloudRunnerTag {
  tag: string
  available: number
  busy: number
  scope: RunnerTokenScope
  scopeSubject?: string
}

export interface RunnerTokenView {
  tokenId: string
  scope: RunnerTokenScope
  scopeId: string
  secret?: string
  createdAt: string
  revokedAt?: string
}

export interface RunnerRegistrationCommandInput {
  tokenId?: string
}

export interface RunnerRegistrationCommand {
  tokenId: string
  scope: RunnerTokenScope
  scopeId: string
  centerUrl: string
  command: string
}

export interface CreateCloudConversationRequest {
  executionTarget: 'cloud'
  tags: string[]
  runtimeId: string
  providerId: string
  modelId: string
  permissionMode?: string
}

export interface CloudConversation {
  conversationId: string
  ownerSubjectId: string
  tenantId: string
  executionTarget: 'cloud'
  tags: string[]
  runtimeId: string
  providerId: string
  modelId: string
  permissionMode?: string
  status: ConversationStatus
  workspaceRef: string
  assignmentEpoch: number
  createdAt: string
  updatedAt: string
}

export interface CloudConversationEvent {
  conversationId: string
  sequence: number
  type: string
  data?: unknown
  terminal?: boolean
  errorCode?: string
  error?: string
  createdAt: string
}

export interface ShareConversationRequest {
  audienceType: 'tenant' | 'user' | 'group' | 'im_group'
  subjectId?: string
}

export interface ConversationShare {
  audienceType: string
  subjectId?: string
  createdAt: string
}

export function isRunnerEnvelope(value: unknown): value is RunnerEnvelope {
  if (!isRecord(value)) return false
  return (
    value.version === RUNNER_PROTOCOL_VERSION &&
    typeof value.messageId === 'string' &&
    value.messageId.trim().length > 0 &&
    typeof value.type === 'string' &&
    (value.type === 'host.hello' || value.type.startsWith('runner.'))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
