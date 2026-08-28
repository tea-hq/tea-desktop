import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type * as acpV1 from '@agentclientprotocol/sdk'
import type * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

import type {
  ApprovalDecision,
  ConversationEventKind,
} from '../../../src/features/conversation/contracts'
import { ConversationRuntimeError } from '../runtime'
import type { AcpPermissionRequest, AcpPermissionResponse } from './connection'

interface PendingPermission {
  conversationId: string
  requestKey: string
  optionIds: ReadonlyMap<ApprovalDecision, string>
  resolve(response: AcpPermissionResponse): void
}

interface PermissionPresentation {
  toolCallId: string
  capabilities: string[]
  resources: string[]
  optionIds: Map<ApprovalDecision, string>
  decisions: ApprovalDecision[]
}

export class AcpPermissionCoordinator {
  private readonly pending = new Map<string, PendingPermission>()
  private readonly requestIds = new Set<string>()

  constructor(private readonly createApprovalId: () => string = randomUUID) {}

  request(
    conversationId: string,
    input: AcpPermissionRequest,
    emit: (event: ConversationEventKind) => void,
  ): Promise<AcpPermissionResponse> {
    const presentation = permissionPresentation(input)
    const requestKey = permissionRequestKey(input)
    if (this.requestIds.has(requestKey)) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP permission request is already pending: ${requestKey}`,
      )
    }

    const approvalId = this.createApprovalId()
    if (!approvalId.trim() || this.pending.has(approvalId)) {
      throw new ConversationRuntimeError('invalidState', 'ACP approval id must be unique')
    }

    let resolvePermission!: (response: AcpPermissionResponse) => void
    const response = new Promise<AcpPermissionResponse>((resolve) => {
      resolvePermission = resolve
    })
    this.requestIds.add(requestKey)
    this.pending.set(approvalId, {
      conversationId,
      requestKey,
      optionIds: presentation.optionIds,
      resolve: resolvePermission,
    })
    emit({
      type: 'approvalRequested',
      approvalId,
      toolCallId: presentation.toolCallId,
      capabilities: presentation.capabilities,
      resources: presentation.resources,
      decisions: presentation.decisions,
    })
    return response
  }

  resolve(conversationId: string, approvalId: string, decision: ApprovalDecision): void {
    const pending = this.pending.get(approvalId)
    if (!pending) {
      throw new ConversationRuntimeError(
        'unknownApproval',
        `ACP approval is no longer pending: ${approvalId}`,
      )
    }
    if (pending.conversationId !== conversationId) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP approval belongs to a different conversation: ${approvalId}`,
      )
    }

    const response: AcpPermissionResponse =
      decision === 'cancel'
        ? { outcome: { outcome: 'cancelled' } }
        : selectedPermission(pending.optionIds, decision)
    this.pending.delete(approvalId)
    this.requestIds.delete(pending.requestKey)
    pending.resolve(response)
  }

  cancelAll(): void {
    for (const [approvalId, pending] of this.pending) {
      this.pending.delete(approvalId)
      this.requestIds.delete(pending.requestKey)
      pending.resolve({ outcome: { outcome: 'cancelled' } })
    }
  }
}

function permissionPresentation(input: AcpPermissionRequest): PermissionPresentation {
  return input.wireVersion === 1
    ? v1PermissionPresentation(input.request)
    : v2PermissionPresentation(input.request)
}

function v1PermissionPresentation(request: acpV1.RequestPermissionRequest): PermissionPresentation {
  const toolCallId = requireText(request.toolCall.toolCallId, 'ACP permission tool call id')
  const title = requireText(
    request.toolCall.title ?? request.toolCall.name ?? request.toolCall.kind,
    'ACP permission title',
  )
  const options = normalizeOptions(request.options)
  return {
    toolCallId,
    capabilities: [firstText([request.toolCall.name, request.toolCall.kind, title])],
    resources: (request.toolCall.locations ?? []).map((location) =>
      requireAbsolutePath(location.path, 'ACP permission resource'),
    ),
    ...options,
  }
}

function v2PermissionPresentation(request: acpV2.RequestPermissionRequest): PermissionPresentation {
  const title = requireText(request.title, 'ACP permission title')
  const subject = request.subject
  if (!subject) {
    throw new ConversationRuntimeError('invalidState', 'ACP permission subject is required')
  }

  let toolCallId: string
  let capabilities: string[]
  let resources: string[]
  if (subject.type === 'tool_call' && 'toolCall' in subject) {
    const toolCall = (subject as acpV2.ToolCallPermissionSubject).toolCall
    toolCallId = requireText(toolCall.toolCallId, 'ACP permission tool call id')
    capabilities = [firstText([toolCall.name, toolCall.kind, title])]
    resources = (toolCall.locations ?? []).map((location) =>
      requireAbsolutePath(location.path, 'ACP permission resource'),
    )
  } else if (subject.type === 'command' && 'command' in subject) {
    const command = subject as acpV2.CommandPermissionSubject
    toolCallId = requireText(command.toolCallId, 'ACP command permission tool call id')
    capabilities = ['terminal.execute']
    resources = [requireAbsolutePath(command.cwd, 'ACP command working directory')]
  } else {
    throw new ConversationRuntimeError(
      'invalidState',
      `ACP permission subject is unsupported: ${subject.type}`,
    )
  }

  return { toolCallId, capabilities, resources, ...normalizeOptions(request.options) }
}

function normalizeOptions(
  options: readonly (acpV1.PermissionOption | acpV2.PermissionOption)[],
): Pick<PermissionPresentation, 'optionIds' | 'decisions'> {
  if (options.length === 0) {
    throw new ConversationRuntimeError('invalidState', 'ACP permission options must not be empty')
  }
  const seenIds = new Set<string>()
  const optionIds = new Map<ApprovalDecision, string>()
  const decisions: ApprovalDecision[] = []
  for (const option of options) {
    const optionId = requireText(option.optionId, 'ACP permission option id')
    requireText(option.name, 'ACP permission option name')
    requireText(option.kind, 'ACP permission option kind')
    if (seenIds.has(optionId)) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP permission option id is duplicated: ${optionId}`,
      )
    }
    seenIds.add(optionId)
    const decision = permissionDecision(option.kind)
    if (!decision) continue
    if (optionIds.has(decision)) {
      throw new ConversationRuntimeError(
        'invalidState',
        `ACP permission options cannot be represented unambiguously: ${decision}`,
      )
    }
    optionIds.set(decision, optionId)
    decisions.push(decision)
  }
  decisions.push('cancel')
  return { optionIds, decisions }
}

function permissionDecision(kind: string): ApprovalDecision | null {
  if (kind === 'allow_once') return 'allowOnce'
  if (kind === 'allow_always') return 'allowSession'
  if (kind === 'reject_once') return 'deny'
  return null
}

function selectedPermission(
  optionIds: ReadonlyMap<ApprovalDecision, string>,
  decision: ApprovalDecision,
): AcpPermissionResponse {
  const optionId = optionIds.get(decision)
  if (!optionId) {
    throw new ConversationRuntimeError(
      'invalidState',
      `ACP Agent did not offer the requested permission decision: ${decision}`,
    )
  }
  return { outcome: { outcome: 'selected', optionId } }
}

function permissionRequestKey(input: AcpPermissionRequest): string {
  return `${input.wireVersion}:${typeof input.requestId}:${String(input.requestId)}`
}

function requireText(value: string | null | undefined, field: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new ConversationRuntimeError('invalidState', `${field} must not be empty`)
  return normalized
}

function requireAbsolutePath(value: string, field: string): string {
  const normalized = requireText(value, field)
  if (!path.isAbsolute(normalized)) {
    throw new ConversationRuntimeError('invalidState', `${field} must be absolute`)
  }
  return normalized
}

function firstText(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  throw new ConversationRuntimeError('invalidState', 'ACP permission capability must not be empty')
}
