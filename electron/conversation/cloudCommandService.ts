import { randomUUID } from 'node:crypto'
import type * as acpV1 from '@agentclientprotocol/sdk'
import type {
  ApprovalDecision,
  ConversationDetail,
  ConversationEvent,
  ConversationEventKind,
  ConversationHistoryPage,
  ConversationPage,
  ConversationSummary,
  ConversationTurn,
  HostToolResult,
  ListConversationsRequest,
  LoadConversationHistoryRequest,
  RuntimeDescriptor,
  SendMessageOptions,
} from '../../src/features/conversation/contracts'
import { reduceConversationTurn } from '../../src/features/conversation/timelineReducer'
import type {
  ChannelSource,
  ChannelSourceInput,
  Delivery,
  Draft,
  MessageRef,
} from '../../src/types/channelCollaboration'
import type {
  CloudConversation,
  CloudConversationEvent,
  CloudRunnerTag,
  RunnerRegistrationCommand,
  RunnerRegistrationCommandInput,
  RunnerTokenView,
  RunnerPermissionDecision,
} from '../../packages/runner/src/protocol'
import {
  cloudConversationToSummary,
  type CloudConversationClient,
  toCloudConversationRequest,
} from '../../src/infrastructure/cloud/cloudRunnerClient'
import {
  RuntimeConversationCommandService,
  type ConversationCommandService,
  type CreateConversationCommand,
} from './commandService'
import { ConversationRuntimeError } from './runtime'
import type { AcpSessionUpdateNotification } from './acp/connection'
import { AcpEventProjector } from './acp/projector'
import { projectPermissionRequest } from './acp/permissions'

const CLOUD_POLL_INTERVAL_MS = 250

export interface CloudConversationCommandEvents {
  conversationEvent(event: ConversationEvent): void
  conversationUpdated(summary: ConversationSummary): void
}

/**
 * Keeps cloud transport in Electron main while presenting the existing
 * ConversationCommandService port to the renderer. Cloud IDs are tracked only
 * as routing metadata; durable cloud truth remains owned by Center.
 */
export class CloudConversationCommandService implements ConversationCommandService {
  private readonly cloudConversationIds = new Set<string>()
  private readonly polls = new Map<string, CloudPoll>()
  private disposed = false

  constructor(
    private readonly local: RuntimeConversationCommandService,
    private readonly cloud: CloudConversationClient,
    private readonly events: CloudConversationCommandEvents,
    private readonly pollIntervalMs = CLOUD_POLL_INTERVAL_MS,
  ) {}

  listRuntimes(): Promise<RuntimeDescriptor[]> {
    return this.local.listRuntimes()
  }

  async listRunnerTags(): Promise<CloudRunnerTag[]> {
    return this.cloud.listRunnerTags()
  }

  async listRunnerTokens(): Promise<RunnerTokenView[]> {
    return this.cloud.listRunnerTokens?.() ?? []
  }

  async resetPersonalRunnerToken(): Promise<RunnerTokenView> {
    if (!this.cloud.resetPersonalRunnerToken) {
      throw new Error('runner token management is unavailable')
    }
    return this.cloud.resetPersonalRunnerToken()
  }

  async createRunnerRegistrationCommand(
    input?: RunnerRegistrationCommandInput,
  ): Promise<RunnerRegistrationCommand> {
    if (!this.cloud.createRunnerRegistrationCommand) {
      throw new Error('runner token management is unavailable')
    }
    return this.cloud.createRunnerRegistrationCommand(input)
  }

  async listConversations(request: ListConversationsRequest): Promise<ConversationPage> {
    const localPage = await this.local.listConversations(request)
    let cloudValues: CloudConversation[] = []
    try {
      cloudValues = await this.cloud.listConversations()
    } catch {
      // A signed-out or offline Center must not hide local conversations.
    }
    const cloudSummaries = cloudValues
      .map((value) => {
        this.rememberCloud(value)
        return cloudConversationToSummary(value)
      })
      .filter((summary) => matchesConversationFilter(summary, request.filter))
    const items = uniqueSorted([...localPage.items, ...cloudSummaries])
    for (const value of cloudValues) this.startPolling(value.conversationId)
    const limit = request.limit && request.limit > 0 ? request.limit : items.length
    return {
      items: items.slice(0, limit),
      nextCursor: localPage.nextCursor,
      hasMore: localPage.hasMore,
    }
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    if (!this.cloudConversationIds.has(conversationId)) {
      try {
        return await this.local.getConversation(conversationId)
      } catch (cause) {
        if (!isUnknownConversation(cause)) throw cause
      }
    }
    const value = await this.cloud.getConversation(conversationId)
    this.rememberCloud(value)
    this.startPolling(value.conversationId)
    return {
      summary: cloudConversationToSummary(value),
      collaboration: { turnContexts: [], drafts: [], deliveries: [] },
    }
  }

  async loadConversationHistory(
    request: LoadConversationHistoryRequest,
  ): Promise<ConversationHistoryPage> {
    if (!this.cloudConversationIds.has(request.conversationId))
      return this.local.loadConversationHistory(request)
    const events = await this.cloud.loadEvents(request.conversationId)
    const turns = projectCloudHistory(events)
    const startIndex = Math.max(0, turns.length - request.limit)
    return {
      items: turns.slice(startIndex),
      nextCursor: null,
      hasMore: startIndex > 0,
      startIndex,
    }
  }

  async createConversation(request: CreateConversationCommand) {
    if (request.executionTarget !== 'cloud') return this.local.createConversation(request)
    const tags = request.runnerTags ?? []
    const parsedModel = request.modelId ? undefined : parseProviderQualifiedModel(request.model)
    const providerId = request.providerId ?? parsedModel?.providerId
    const modelId = request.modelId ?? parsedModel?.modelId
    if (!providerId || !modelId) {
      throw new ConversationRuntimeError(
        'invalidConfiguration',
        'cloud conversation requires providerId and modelId',
      )
    }
    const cloudRequest = toCloudConversationRequest({
      target: 'cloud',
      runtimeId: request.runtimeId,
      providerId,
      modelId,
      tags,
    })
    if (request.permissionMode) cloudRequest.permissionMode = request.permissionMode
    const value = await this.cloud.createConversation(cloudRequest, request.idempotencyKey)
    this.rememberCloud(value)
    this.startPolling(value.conversationId)
    const summary = cloudConversationToSummary(value)
    this.events.conversationUpdated(summary)
    return { handle: { conversationId: value.conversationId, runtimeId: value.runtimeId }, summary }
  }

  async appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): Promise<ChannelSource[]> {
    return this.localOrUnsupported(conversationId, () =>
      this.local.appendConversationSources(conversationId, turnIndex, sources),
    )
  }

  createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Promise<Draft> {
    return this.localOrUnsupported(conversationId, () =>
      this.local.createDraft(conversationId, sourceTurnIndex, sourceBlockId, content),
    )
  }

  updateDraft(draftId: string, content: string): Promise<Draft> {
    return this.local.updateDraft(draftId, content)
  }

  prepareDelivery(draftId: string): Promise<Delivery> {
    return this.local.prepareDelivery(draftId)
  }

  updateDelivery(
    deliveryId: string,
    status: Delivery['status'],
    sentMessageRef?: MessageRef,
    failureCode?: string,
  ): Promise<Delivery> {
    return this.local.updateDelivery(deliveryId, status, sentMessageRef, failureCode)
  }

  async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    if (!this.cloudConversationIds.has(conversationId)) {
      return this.local.sendMessage(conversationId, text, options)
    }
    await this.cloud.sendMessage(
      conversationId,
      text,
      `cloud-message:${conversationId}:${randomUUID()}`,
    )
    this.startPolling(conversationId)
  }

  async cancel(conversationId: string): Promise<void> {
    if (!this.cloudConversationIds.has(conversationId)) return this.local.cancel(conversationId)
    await this.cloud.cancelConversation(conversationId)
    this.startPolling(conversationId)
  }

  respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    if (!this.cloudConversationIds.has(conversationId)) {
      return this.local.respondToApproval(conversationId, approvalId, decision)
    }
    if (!this.cloud.respondToApproval) {
      throw new ConversationRuntimeError(
        'unsupportedCapability',
        'Center does not support cloud permission approvals',
      )
    }
    return this.cloud.respondToApproval(
      conversationId,
      approvalId,
      decision as RunnerPermissionDecision,
    )
  }

  async resolveHostToolCall(result: HostToolResult): Promise<void> {
    if (this.cloudConversationIds.has(result.conversationId))
      throw unsupportedCloud('Center owns cloud HostTool calls')
    await this.local.resolveHostToolCall(result)
  }

  rename(conversationId: string, title: string): Promise<void> {
    return this.localOrUnsupported(conversationId, () => this.local.rename(conversationId, title))
  }

  archive(conversationId: string): Promise<void> {
    return this.localOrUnsupported(conversationId, () => this.local.archive(conversationId))
  }

  async remove(conversationId: string): Promise<void> {
    if (!this.cloudConversationIds.has(conversationId)) return this.local.remove(conversationId)
    await this.cloud.deleteConversation(conversationId)
    this.stopPolling(conversationId)
    this.cloudConversationIds.delete(conversationId)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const conversationId of this.polls.keys()) this.stopPolling(conversationId)
  }

  /** Forces one cursor sync; useful when a caller needs an immediate refresh. */
  async pollConversationNow(conversationId: string): Promise<void> {
    if (!this.polls.has(conversationId)) this.startPolling(conversationId)
    const poll = this.polls.get(conversationId)
    if (poll) await this.poll(poll, conversationId)
  }

  private async localOrUnsupported<T>(
    conversationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.cloudConversationIds.has(conversationId)) throw unsupportedCloud()
    return operation()
  }

  private rememberCloud(value: CloudConversation): void {
    this.cloudConversationIds.add(value.conversationId)
  }

  private startPolling(conversationId: string): void {
    if (this.disposed || this.polls.has(conversationId)) return
    const poll: CloudPoll = {
      cursor: 0,
      timer: null,
      running: false,
      projector: new CloudEventProjector(),
    }
    this.polls.set(conversationId, poll)
    poll.timer = setTimeout(() => void this.poll(poll, conversationId), this.pollIntervalMs)
    poll.timer.unref?.()
  }

  private stopPolling(conversationId: string): void {
    const poll = this.polls.get(conversationId)
    if (!poll) return
    if (poll.timer) clearTimeout(poll.timer)
    this.polls.delete(conversationId)
  }

  private async poll(poll: CloudPoll, conversationId: string): Promise<void> {
    if (this.disposed || this.polls.get(conversationId) !== poll || poll.running) return
    poll.running = true
    try {
      const values = await this.cloud.loadEvents(conversationId, poll.cursor)
      for (const value of values.sort((left, right) => left.sequence - right.sequence)) {
        if (value.sequence <= poll.cursor) continue
        poll.cursor = value.sequence
        for (const event of poll.projector.project(value)) this.events.conversationEvent(event)
      }
      if (values.length > 0) {
        const summary = cloudConversationToSummary(await this.cloud.getConversation(conversationId))
        this.events.conversationUpdated(summary)
      }
    } catch {
      // Polling is best effort; the next cursor request recovers after transient failures.
    } finally {
      poll.running = false
      if (!this.disposed && this.polls.get(conversationId) === poll) {
        poll.timer = setTimeout(() => void this.poll(poll, conversationId), this.pollIntervalMs)
        poll.timer.unref?.()
      }
    }
  }
}

interface CloudPoll {
  cursor: number
  timer: ReturnType<typeof setTimeout> | null
  running: boolean
  projector: CloudEventProjector
}

class CloudEventProjector {
  private readonly acp = new AcpEventProjector(1)
  private agentMessageText = ''

  project(value: CloudConversationEvent): ConversationEvent[] {
    const base = { conversationId: value.conversationId, sequence: value.sequence }
    switch (value.type) {
      case 'user.prompt':
        this.agentMessageText = ''
        return []
      case 'acp.session.update':
        return this.projectAcpUpdate(value, base)
      case 'permission.requested':
        return this.projectPermissionRequest(value, base)
      case 'conversation.started':
        return [{ ...base, event: { type: 'runStarted' } }]
      case 'assistant.message': {
        const text = eventText(value.data)
        if (text === undefined) return []
        const delta = this.agentMessageText
          ? text.startsWith(this.agentMessageText)
            ? text.slice(this.agentMessageText.length)
            : text
          : text
        this.agentMessageText = ''
        return [
          {
            ...base,
            event: { type: 'messageDelta', text: delta, terminal: value.terminal },
          },
        ]
      }
      case 'conversation.failed':
        this.agentMessageText = ''
        return [
          {
            ...base,
            event: {
              type: 'runFailed',
              failure: {
                code: 'externalCli',
                message: value.error || value.errorCode,
                retryable: false,
              },
            },
          },
        ]
      case 'conversation.cancelled':
        this.agentMessageText = ''
        return [
          {
            ...base,
            event: {
              type: 'runFailed',
              failure: { code: 'cancelled', message: value.error, retryable: false },
            },
          },
        ]
      case 'conversation.completed':
        this.agentMessageText = ''
        return [{ ...base, event: { type: 'runFinished' } }]
      default:
        if (value.terminal && value.errorCode) {
          this.agentMessageText = ''
          return [
            {
              ...base,
              event: {
                type: 'runFailed',
                failure: {
                  code: 'externalCli',
                  message: value.error || value.errorCode,
                  retryable: false,
                },
              },
            },
          ]
        }
        return []
    }
  }

  private projectAcpUpdate(
    value: CloudConversationEvent,
    base: { conversationId: string; sequence: number },
  ): ConversationEvent[] {
    const input = parseAcpUpdate(value.data)
    if (!input) return []
    let projected: ConversationEventKind[]
    try {
      projected = this.acp.project(input).events
    } catch {
      // A malformed or newer ACP update must not break cloud event polling.
      return []
    }
    for (const event of projected) {
      if (event.type === 'messageDelta') this.agentMessageText += event.text
    }
    return projected.map((event, index) => ({
      ...base,
      sequence: projectedSequence(base.sequence, index, projected.length),
      event,
    }))
  }

  private projectPermissionRequest(
    value: CloudConversationEvent,
    base: { conversationId: string; sequence: number },
  ): ConversationEvent[] {
    if (!isRecord(value.data) || typeof value.data.approvalId !== 'string') return []
    const request = value.data.request
    if (!isRecord(request)) return []
    try {
      const event = projectPermissionRequest(value.data.approvalId, {
        wireVersion: 1,
        requestId: value.data.approvalId,
        request: request as acpV1.RequestPermissionRequest,
      })
      return [{ ...base, event }]
    } catch {
      return []
    }
  }
}

function projectCloudHistory(events: CloudConversationEvent[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let current: ConversationTurn | undefined
  const projector = new CloudEventProjector()
  for (const value of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (value.type === 'user.prompt') {
      projector.project(value)
      const text = eventText(value.data) ?? ''
      current = {
        id: `${value.conversationId}-turn-${turns.length + 1}`,
        user: { id: `${value.conversationId}-prompt-${turns.length + 1}`, text, attachments: [] },
        blocks: [],
        status: 'sending',
        lastEventSequence: value.sequence,
      }
      turns.push(current)
      continue
    }
    if (!current && value.type === 'conversation.started') continue
    if (!current) {
      current = {
        id: `${value.conversationId}-turn-1`,
        user: { id: `${value.conversationId}-prompt-1`, text: '', attachments: [] },
        blocks: [],
        status: 'sending',
        lastEventSequence: 0,
      }
      turns.push(current)
    }
    const active = current
    if (!active) continue
    let reduced = active
    for (const event of projector.project(value)) {
      reduced = reduceConversationTurn(reduced, event)
    }
    current = reduced
    turns[turns.length - 1] = reduced
  }
  return turns
}

function parseAcpUpdate(value: unknown): AcpSessionUpdateNotification | undefined {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || !isRecord(value.update)) {
    return undefined
  }
  if (typeof value.update.sessionUpdate !== 'string') return undefined
  return { wireVersion: 1, notification: value as acpV1.SessionNotification }
}

function projectedSequence(sequence: number, index: number, count: number): number {
  return sequence + (count > 1 ? index / count : 0)
}

function eventText(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.text !== 'string') return undefined
  return value.text
}

function parseProviderQualifiedModel(
  value: string | undefined,
): { providerId: string; modelId: string } | undefined {
  if (!value) return undefined
  const separator = value.indexOf('/')
  if (separator <= 0 || separator === value.length - 1) return undefined
  return { providerId: value.slice(0, separator), modelId: value.slice(separator + 1) }
}

function matchesConversationFilter(
  summary: ConversationSummary,
  filter: ListConversationsRequest['filter'],
): boolean {
  if (!filter || filter.kind === 'all') return true
  if (filter.kind === 'local') return summary.executionTarget !== 'cloud'
  if (filter.kind === 'channel') return Boolean(summary.channelBinding)
  return false
}

function uniqueSorted(items: ConversationSummary[]): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>()
  for (const item of items) byId.set(item.conversationId, item)
  return [...byId.values()].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.conversationId.localeCompare(left.conversationId),
  )
}

function unsupportedCloud(
  message = 'cloud conversation operation is not supported',
): ConversationRuntimeError {
  return new ConversationRuntimeError('unsupportedCapability', message)
}

function isUnknownConversation(value: unknown): boolean {
  return (value as { code?: unknown } | null)?.code === 'unknownConversation'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
