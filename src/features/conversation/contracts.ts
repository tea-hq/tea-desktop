export type RuntimeKind = 'externalCli'

export type RuntimeCapability =
  | 'approval'
  | 'cancel'
  | 'delete'
  | 'events'
  | 'history'
  | 'hostTools'
  | 'prompt'
  | 'snapshot'
  | 'subject'

export type ConversationJson =
  string | number | boolean | null | ConversationJson[] | { [key: string]: ConversationJson }

export interface HostToolDefinition {
  name: string
  version: string
  description: string
  inputSchema: { [key: string]: ConversationJson }
  outputSchema: { [key: string]: ConversationJson }
}

export interface HostToolCall {
  conversationId: string
  callId: string
  name: string
  arguments: { [key: string]: ConversationJson }
}

export type HostToolFailureCode =
  'cancelled' | 'executionFailed' | 'invalidRequest' | 'limitExceeded' | 'timeout' | 'unavailable'

export type HostToolResult =
  | {
      conversationId: string
      callId: string
      status: 'success'
      output: { [key: string]: ConversationJson }
    }
  | {
      conversationId: string
      callId: string
      status: 'failure'
      code: HostToolFailureCode
      message?: string
    }

export type RuntimeStatus = 'ready' | 'unconfigured' | 'unavailable'

export type RuntimeModelSource = 'local' | 'center' | 'runtime'

export interface RuntimeModelDescriptor {
  value: string
  providerId: string
  displayName: string
  source: RuntimeModelSource
}

export interface RuntimeDescriptor {
  id: string
  kind: RuntimeKind
  displayName: string
  capabilities: RuntimeCapability[]
  status: RuntimeStatus
  models?: RuntimeModelDescriptor[]
}

export interface AgentRoleOption {
  id: string
  name: string
  revision: number
  runtimeId: string
  description?: string
  prompt?: string
  skills?: string[]
}

export interface ConversationHandle {
  conversationId: string
  runtimeId: string
  nativeSessionId?: string
}

export type ConversationEventKind =
  | { type: 'runStarted' }
  | { type: 'messageDelta'; text: string }
  | {
      type: 'thoughtDelta'
      text: string
      messageId?: string | null
      replace?: boolean
    }
  | {
      type: 'toolRequested'
      toolCallId: string
      name: string
      arguments: unknown
    }
  | {
      type: 'toolProgress'
      toolCallId: string
      message: string
      completedUnits: number
      totalUnits?: number
    }
  | {
      type: 'toolCompleted'
      toolCallId: string
      status: Extract<ToolCallStatus, 'completed' | 'failed' | 'cancelled'>
      message?: string
    }
  | {
      type: 'approvalRequested'
      approvalId: string
      toolCallId: string
      capabilities: string[]
      resources: string[]
      decisions: ApprovalDecision[]
    }
  | { type: 'runFinished' }
  | { type: 'runFailed'; failure: ConversationFailure }

export type ConversationFailureCode =
  | 'invalidRequest'
  | 'authentication'
  | 'permissionDenied'
  | 'rateLimited'
  | 'contextOverflow'
  | 'unavailable'
  | 'transport'
  | 'cancelled'
  | 'internal'
  | 'externalCli'

export interface ConversationFailure {
  code: ConversationFailureCode
  message?: string
  retryable: boolean
}

export interface ConversationEvent {
  conversationId: string
  sequence: number
  event: ConversationEventKind
}

export interface ConversationUserPrompt {
  id: string
  text: string
  attachments: string[]
}

export type PermissionMode = 'default' | 'readOnly' | 'fullAccess'

export type ThinkingEffort = 'light' | 'medium' | 'high' | 'extraHigh' | 'ultra'

export type ApprovalDecision = 'allowOnce' | 'allowSession' | 'deny' | 'cancel'

export type ApprovalRequestStatus = 'pending' | 'resolving' | 'failed'

export interface ApprovalRequest {
  id: string
  toolCallId: string
  toolName: string
  capabilities: string[]
  resources: string[]
  decisions: ApprovalDecision[]
  status: ApprovalRequestStatus
  decision?: ApprovalDecision
  error?: string
}

export type ConversationTurnStatus = 'sending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AssistantTextBlock {
  kind: 'assistantText'
  id: string
  sequence: number
  text: string
  streaming: boolean
}

export interface AgentThoughtBlock {
  kind: 'agentThought'
  id: string
  sequence: number
  text: string
  streaming: boolean
  messageId?: string | null
}

export type ToolCallStatus =
  'requested' | 'running' | 'approvalRequired' | 'completed' | 'failed' | 'cancelled'

export interface ToolCallBlock {
  kind: 'toolCall'
  id: string
  sequence: number
  name: string
  status: ToolCallStatus
  arguments?: unknown
  message?: string
  completedUnits?: number
  totalUnits?: number
  approval?: ApprovalRequest
}

export interface FailureTipBlock {
  kind: 'failureTip'
  id: string
  sequence: number
  failure: ConversationFailure
}

export type ConversationTurnBlock =
  AssistantTextBlock | AgentThoughtBlock | ToolCallBlock | FailureTipBlock

export interface ConversationTurn {
  id: string
  user: ConversationUserPrompt
  blocks: ConversationTurnBlock[]
  status: ConversationTurnStatus
  lastEventSequence: number
}

export interface ComposerAttachment {
  id: string
  name: string
  size: number
}

export interface SendMessageOptions {
  model: string
  permissionMode: PermissionMode
  sources?: ChannelSourceInput[]
}

export interface ModelOption {
  value: string
  label?: string
  labelKey?: string
  source?: RuntimeModelSource
  unavailable?: boolean
}

export type ConversationUiError =
  | { kind: 'localized'; key: string; params?: Record<string, string | number> }
  | { kind: 'runtime'; message: string }

export interface ConversationSummary {
  conversationId: string
  runtimeId: string
  workspaceId: string
  workingDirectory?: string
  title?: string
  lastMessagePreview?: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
  channelBinding?: ChannelBinding
}

export interface ListConversationsRequest {
  cursor?: string
  limit?: number
  includeArchived?: boolean
  filter?: ConversationScopeFilter
}

export interface ConversationPage {
  items: ConversationSummary[]
  nextCursor: string | null
  hasMore: boolean
}

export interface ConversationSnapshot {
  conversationId: string
  turns: ConversationTurn[]
}

export interface ConversationDetail {
  summary: ConversationSummary
  collaboration: CollaborationSnapshot
}

export interface LoadConversationHistoryRequest {
  conversationId: string
  cursor?: string
  limit: number
}

export interface ConversationHistoryPage {
  items: ConversationTurn[]
  nextCursor: string | null
  hasMore: boolean
  startIndex: number
}

export interface CreateConversationResponse {
  handle: ConversationHandle
  summary: ConversationSummary | null
}

export interface CreateConversationOptions {
  idempotencyKey: string
  model?: string
  workingDirectory?: string
  channelBinding?: ChannelBinding
  hostTools?: HostToolDefinition[]
}

export interface ConversationClient {
  listRuntimes(): Promise<RuntimeDescriptor[]>
  listConversations(request: ListConversationsRequest): Promise<ConversationPage>
  getConversation(conversationId: string): Promise<ConversationDetail>
  loadConversationHistory(request: LoadConversationHistoryRequest): Promise<ConversationHistoryPage>
  createConversation(
    runtimeId: string,
    options: CreateConversationOptions,
  ): Promise<CreateConversationResponse>
  appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): Promise<ChannelSource[]>
  createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Promise<Draft>
  updateDraft(draftId: string, content: string): Promise<Draft>
  prepareDelivery(draftId: string): Promise<Delivery>
  markDeliverySending(deliveryId: string): Promise<Delivery>
  completeDelivery(deliveryId: string, sentMessageRef: MessageRef): Promise<Delivery>
  failDelivery(deliveryId: string, failureCode: string): Promise<Delivery>
  renameConversation(conversationId: string, title: string): Promise<void>
  archiveConversation(conversationId: string): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  sendMessage(conversationId: string, text: string, options: SendMessageOptions): Promise<void>
  cancelConversation(conversationId: string): Promise<void>
  respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void>
  resolveHostToolCall(result: HostToolResult): Promise<void>
  subscribeToEvents(
    conversationId: string,
    handler: (event: ConversationEvent) => void,
  ): Promise<() => void>
  subscribeToAllEvents(handler: (event: ConversationEvent) => void): () => void
  subscribeToHostToolCalls(
    conversationId: string,
    handler: (call: HostToolCall) => void,
  ): Promise<() => void>
  subscribeToConversationUpdates(handler: (summary: ConversationSummary) => void): () => void
}
import type {
  ChannelBinding,
  ChannelSource,
  ChannelSourceInput,
  CollaborationSnapshot,
  ConversationScopeFilter,
  Delivery,
  Draft,
  MessageRef,
} from '@/types/channelCollaboration'
export type { ConversationScopeFilter } from '@/types/channelCollaboration'
