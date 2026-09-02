import path from 'node:path'

import type {
  ApprovalDecision,
  ConversationEvent,
  ConversationHandle,
  ConversationHistoryPage,
  ConversationSnapshot,
  HostToolDefinition,
  LoadConversationHistoryRequest,
  RuntimeCapability,
  RuntimeDescriptor,
  SendMessageOptions,
} from '../../src/features/conversation/contracts'

export type ConversationRuntimeErrorCode =
  | 'connectionFailed'
  | 'duplicateRuntimeId'
  | 'invalidConfiguration'
  | 'invalidHistoryCursor'
  | 'invalidHistoryLimit'
  | 'invalidState'
  | 'notConfigured'
  | 'shutDown'
  | 'unknownConversation'
  | 'unknownApproval'
  | 'unknownRuntime'
  | 'unsupportedCapability'
  | 'workspaceUnavailable'

export class ConversationRuntimeError extends Error {
  constructor(
    readonly code: ConversationRuntimeErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ConversationRuntimeError'
  }
}

export interface RuntimeConversationSnapshot extends ConversationSnapshot {
  nativeSessionId: string
}

export interface RuntimeConversationBinding {
  schemaVersion: 1
  runtimeId: string
  nativeSessionId: string
  /** Non-secret model routing needed to recreate a provider-backed session. */
  selection?: RuntimeConversationSelection
  implementation: {
    kind: string
    id: string
    revision: number
  }
  protocol: {
    name: string
    version: number
  }
  artifact: {
    packageName: string
    version: string
    integrity: string
  }
  workspacePath: string
  hostTools: Array<{
    name: string
    version: string
  }>
}

export interface RuntimeConversationSelection {
  modelId: string
  providerId?: string
}

export interface RuntimeConversationHandle extends ConversationHandle {
  nativeSessionId: string
  binding: RuntimeConversationBinding
}

/** Main-process-only routing data for a provider-qualified model selection. */
export interface RuntimeProviderConfiguration {
  providerId: string
  kind: string
  displayName: string
  baseUrl: string
  apiKey: string
  modelId: string
  modelIds: string[]
}

export interface RuntimeConversationCreateOptions {
  model: string
  provider?: RuntimeProviderConfiguration
  /** Optional per-conversation ACP cwd; omitted means the runtime default. */
  workspacePath?: string
}

export interface RuntimeConversationCommand {
  conversationId: string
  text: string
  options: SendMessageOptions
}

export type ConversationEventListener = (event: ConversationEvent) => void

export interface ConversationRuntime {
  descriptor(): RuntimeDescriptor
  createConversation(
    conversationId: string,
    options?: RuntimeConversationCreateOptions,
  ): Promise<RuntimeConversationHandle>
  restoreConversation(
    conversationId: string,
    binding: RuntimeConversationBinding,
    options?: RuntimeConversationCreateOptions,
  ): Promise<RuntimeConversationHandle>
  closeConversation(conversationId: string): Promise<void>
  deleteConversation(
    conversationId: string,
    binding: RuntimeConversationBinding,
    options?: RuntimeConversationCreateOptions,
  ): Promise<void>
  configureHostTools(conversationId: string, definitions: HostToolDefinition[]): Promise<void>
  loadSnapshot(conversationId: string): Promise<RuntimeConversationSnapshot>
  loadHistory(request: LoadConversationHistoryRequest): Promise<ConversationHistoryPage>
  generateSubject(sourceText: string): Promise<string>
  sendMessage(command: RuntimeConversationCommand): Promise<void>
  cancel(conversationId: string): Promise<void>
  resolveApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void>
  subscribe(conversationId: string, listener: ConversationEventListener): () => void
  shutdown(): Promise<void>
}

const BINDING_ROOT_KEYS = [
  'schemaVersion',
  'runtimeId',
  'nativeSessionId',
  'implementation',
  'protocol',
  'artifact',
  'workspacePath',
  'hostTools',
] as const
const BINDING_OPTIONAL_ROOT_KEYS = ['selection'] as const
const BINDING_IMPLEMENTATION_KEYS = ['kind', 'id', 'revision'] as const
const BINDING_PROTOCOL_KEYS = ['name', 'version'] as const
const BINDING_ARTIFACT_KEYS = ['packageName', 'version', 'integrity'] as const
const BINDING_HOST_TOOL_KEYS = ['name', 'version'] as const
const MAX_BINDING_TEXT_CHARS = 1024
const MAX_BINDING_PATH_CHARS = 4096
const MAX_BINDING_HOST_TOOLS = 128

export function parseRuntimeConversationBinding(value: unknown): RuntimeConversationBinding {
  if (!isRecord(value) || !hasExactKeys(value, BINDING_ROOT_KEYS, BINDING_OPTIONAL_ROOT_KEYS)) {
    throw invalidBinding()
  }
  if (
    value.schemaVersion !== 1 ||
    !validBindingText(value.runtimeId) ||
    !validBindingText(value.nativeSessionId) ||
    !validBindingPath(value.workspacePath)
  ) {
    throw invalidBinding()
  }

  const implementation = value.implementation
  const protocol = value.protocol
  const artifact = value.artifact
  if (
    !isRecord(implementation) ||
    !hasExactKeys(implementation, BINDING_IMPLEMENTATION_KEYS) ||
    !validBindingText(implementation.kind) ||
    !validBindingText(implementation.id) ||
    !Number.isInteger(implementation.revision) ||
    (implementation.revision as number) < 1 ||
    !isRecord(protocol) ||
    !hasExactKeys(protocol, BINDING_PROTOCOL_KEYS) ||
    !validBindingText(protocol.name) ||
    !Number.isInteger(protocol.version) ||
    (protocol.version as number) < 1 ||
    !isRecord(artifact) ||
    !hasExactKeys(artifact, BINDING_ARTIFACT_KEYS) ||
    !validBindingText(artifact.packageName) ||
    !validBindingText(artifact.version) ||
    !validBindingText(artifact.integrity)
  ) {
    throw invalidBinding()
  }

  if (!Array.isArray(value.hostTools) || value.hostTools.length > MAX_BINDING_HOST_TOOLS) {
    throw invalidBinding()
  }
  const selection =
    value.selection === undefined ? undefined : parseRuntimeConversationSelection(value.selection)
  const seenHostTools = new Set<string>()
  const hostTools = value.hostTools.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, BINDING_HOST_TOOL_KEYS) ||
      !validBindingText(candidate.name) ||
      !validBindingText(candidate.version)
    ) {
      throw invalidBinding()
    }
    const key = candidate.name
    if (seenHostTools.has(key)) throw invalidBinding()
    seenHostTools.add(key)
    return { name: candidate.name, version: candidate.version }
  })

  return {
    schemaVersion: 1,
    runtimeId: value.runtimeId,
    nativeSessionId: value.nativeSessionId,
    ...(selection ? { selection } : {}),
    implementation: {
      kind: implementation.kind,
      id: implementation.id,
      revision: implementation.revision as number,
    },
    protocol: { name: protocol.name, version: protocol.version as number },
    artifact: {
      packageName: artifact.packageName,
      version: artifact.version,
      integrity: artifact.integrity,
    },
    workspacePath: value.workspacePath,
    hostTools,
  }
}

export function unsupportedCapability(capability: RuntimeCapability): ConversationRuntimeError {
  return new ConversationRuntimeError(
    'unsupportedCapability',
    `runtime capability is not supported: ${capability}`,
  )
}

function parseRuntimeConversationSelection(value: unknown): RuntimeConversationSelection {
  if (!isRecord(value) || !hasExactKeys(value, ['modelId'], ['providerId'])) {
    throw invalidBinding()
  }
  if (!validBindingText(value.modelId)) throw invalidBinding()
  if (value.providerId !== undefined && !validBindingText(value.providerId)) {
    throw invalidBinding()
  }
  return {
    modelId: value.modelId,
    ...(value.providerId === undefined ? {} : { providerId: value.providerId }),
  }
}

function invalidBinding(): ConversationRuntimeError {
  return new ConversationRuntimeError(
    'invalidConfiguration',
    'runtime conversation binding is invalid',
  )
}

function validBindingText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_BINDING_TEXT_CHARS &&
    value.trim().length > 0 &&
    !value.includes('\0') &&
    !value.includes('\r') &&
    !value.includes('\n')
  )
}

function validBindingPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_BINDING_PATH_CHARS &&
    !value.includes('\0') &&
    path.isAbsolute(value)
  )
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.length >= required.length &&
    keys.length <= required.length + optional.length &&
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
