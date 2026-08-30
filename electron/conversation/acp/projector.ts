import type * as acpV1 from '@agentclientprotocol/sdk'
import type * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

import type {
  ConversationEventKind,
  ConversationFailure,
} from '../../../src/features/conversation/contracts'
import { ConversationRuntimeError } from '../runtime'
import type { AcpSessionUpdateNotification } from './connection'

export interface AcpProjectedUpdate {
  events: ConversationEventKind[]
  terminal?: Extract<ConversationEventKind, { type: 'runFinished' | 'runFailed' }>
}

interface ToolProjection {
  name: string
  status?: string | null
  terminal: boolean
  fingerprint: string
}

interface ToolPatch {
  toolCallId: string
  name?: string | null
  title?: string | null
  kind?: string | null
  status?: string | null
  rawInput?: unknown
  rawOutput?: unknown
  content?: readonly unknown[] | null
}

export class AcpEventProjector {
  private readonly tools = new Map<string, ToolProjection>()
  private readonly v2AgentMessages = new Map<string, string>()
  private readonly v2AgentThoughts = new Map<string, string>()

  constructor(private readonly wireVersion: 1 | 2) {}

  project(input: AcpSessionUpdateNotification): AcpProjectedUpdate {
    if (input.wireVersion !== this.wireVersion) {
      throw invalidUpdate(
        `ACP update version ${input.wireVersion} does not match connection version ${this.wireVersion}`,
      )
    }
    return input.wireVersion === 1
      ? this.projectV1(input.notification)
      : this.projectV2(input.notification)
  }

  terminalFromV1(
    stopReason: acpV1.StopReason,
  ): Extract<ConversationEventKind, { type: 'runFinished' | 'runFailed' }> {
    return terminalFromStopReason(stopReason)
  }

  private projectV1(notification: acpV1.SessionNotification): AcpProjectedUpdate {
    const update = notification.update
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        return { events: textDelta(update.content) }
      case 'agent_thought_chunk':
        return { events: thoughtDelta(update.content, update.messageId) }
      case 'tool_call':
      case 'tool_call_update':
        return { events: this.projectTool(update, 1) }
      default:
        return { events: [] }
    }
  }

  private projectV2(notification: acpV2.UpdateSessionNotification): AcpProjectedUpdate {
    const update = notification.update
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        return {
          events: this.projectV2AgentChunk(update as acpV2.ContentChunk),
        }
      case 'agent_message':
        return {
          events: this.projectV2AgentMessage(update as acpV2.AgentMessage),
        }
      case 'agent_thought_chunk':
        return {
          events: this.projectV2AgentThoughtChunk(update as acpV2.ContentChunk),
        }
      case 'agent_thought':
        return {
          events: this.projectV2AgentThought(update as acpV2.AgentThought),
        }
      case 'tool_call_update':
        return {
          events: this.projectTool(update as acpV2.ToolCallUpdate, 2),
        }
      case 'state_update': {
        const state = update as acpV2.StateUpdate & { stopReason?: unknown }
        const stopReason =
          typeof state.stopReason === 'string' && state.stopReason ? state.stopReason : 'end_turn'
        return state.state === 'idle'
          ? { events: [], terminal: terminalFromStopReason(stopReason) }
          : { events: [] }
      }
      default:
        return { events: [] }
    }
  }

  private projectV2AgentChunk(update: acpV2.ContentChunk): ConversationEventKind[] {
    const delta = contentText(update.content)
    if (!delta) return []
    const previous = this.v2AgentMessages.get(update.messageId) ?? ''
    this.v2AgentMessages.set(update.messageId, previous + delta)
    return [{ type: 'messageDelta', text: delta }]
  }

  private projectV2AgentMessage(update: acpV2.AgentMessage): ConversationEventKind[] {
    if (update.content === undefined) return []
    const previous = this.v2AgentMessages.get(update.messageId) ?? ''
    const next = update.content ? update.content.map(contentText).join('') : ''
    if (next === previous) return []
    if (!next.startsWith(previous)) {
      throw invalidUpdate(
        `ACP V2 agent message replacement cannot be represented as an ordered Tea delta: ${update.messageId}`,
      )
    }
    this.v2AgentMessages.set(update.messageId, next)
    const delta = next.slice(previous.length)
    return delta ? [{ type: 'messageDelta', text: delta }] : []
  }

  private projectV2AgentThoughtChunk(update: acpV2.ContentChunk): ConversationEventKind[] {
    const delta = contentText(update.content)
    if (!delta) return []
    const previous = this.v2AgentThoughts.get(update.messageId) ?? ''
    this.v2AgentThoughts.set(update.messageId, previous + delta)
    return [{ type: 'thoughtDelta', text: delta, messageId: update.messageId }]
  }

  private projectV2AgentThought(update: acpV2.AgentThought): ConversationEventKind[] {
    if (update.content === undefined) return []
    const previous = this.v2AgentThoughts.get(update.messageId) ?? ''
    const next = update.content ? update.content.map(contentText).join('') : ''
    if (next === previous) return []
    this.v2AgentThoughts.set(update.messageId, next)
    if (next.startsWith(previous)) {
      const delta = next.slice(previous.length)
      return delta ? [{ type: 'thoughtDelta', text: delta, messageId: update.messageId }] : []
    }
    return [{ type: 'thoughtDelta', text: next, messageId: update.messageId, replace: true }]
  }

  private projectTool(update: ToolPatch, wireVersion: 1 | 2): ConversationEventKind[] {
    const toolCallId = update.toolCallId.trim()
    if (!toolCallId) throw invalidUpdate('ACP tool call id must not be empty')

    const fingerprint = `${wireVersion}:${safeFingerprint(update)}`
    const existing = this.tools.get(toolCallId)
    if (existing?.fingerprint === fingerprint) return []
    if (existing?.terminal) {
      if (isTerminalToolStatus(update.status) && existing.status === update.status) return []
      throw invalidUpdate(
        `ACP tool call was updated after reaching a terminal state: ${toolCallId}`,
      )
    }

    const name =
      update.name?.trim() || update.title?.trim() || update.kind?.trim() || existing?.name || 'tool'
    const status = update.status ?? existing?.status
    const events: ConversationEventKind[] = []
    if (!existing) {
      events.push({
        type: 'toolRequested',
        toolCallId,
        name,
        arguments: update.rawInput ?? {},
      })
    }

    if (status === 'in_progress') {
      events.push({
        type: 'toolProgress',
        toolCallId,
        message: update.title?.trim() || name,
        completedUnits: 0,
      })
    } else if (isTerminalToolStatus(status)) {
      events.push({
        type: 'toolCompleted',
        toolCallId,
        status: status === 'cancelled' ? 'cancelled' : status,
        message: toolMessage(update),
      })
    }

    this.tools.set(toolCallId, {
      name,
      status,
      terminal: isTerminalToolStatus(status),
      fingerprint,
    })
    return events
  }
}

function textDelta(content: acpV1.ContentBlock): ConversationEventKind[] {
  const text = contentText(content)
  return text ? [{ type: 'messageDelta', text }] : []
}

function thoughtDelta(
  content: acpV1.ContentBlock,
  messageId?: string | null,
): ConversationEventKind[] {
  const text = contentText(content)
  return text ? [{ type: 'thoughtDelta', text, messageId }] : []
}

function contentText(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const value = content as { type?: unknown; text?: unknown }
  return value.type === 'text' && typeof value.text === 'string' ? value.text : ''
}

function toolMessage(update: ToolPatch): string | undefined {
  for (const item of update.content ?? []) {
    if (!item || typeof item !== 'object') continue
    const value = item as { type?: unknown; content?: unknown }
    if (value.type !== 'content') continue
    const text = contentText(value.content)
    if (text) return text
  }
  return typeof update.rawOutput === 'string' && update.rawOutput.trim()
    ? update.rawOutput
    : undefined
}

function isTerminalToolStatus(
  status: string | null | undefined,
): status is 'completed' | 'failed' | 'cancelled' {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function terminalFromStopReason(
  stopReason: string,
): Extract<ConversationEventKind, { type: 'runFinished' | 'runFailed' }> {
  if (stopReason === 'end_turn') return { type: 'runFinished' }
  if (stopReason === 'cancelled') {
    return {
      type: 'runFailed',
      failure: { code: 'cancelled', retryable: false },
    }
  }
  const failure: ConversationFailure =
    stopReason === 'max_tokens' || stopReason === 'max_turn_requests'
      ? {
          code: 'contextOverflow',
          message: `ACP Agent stopped the turn: ${stopReason}`,
          retryable: true,
        }
      : {
          code: 'externalCli',
          message: `ACP Agent stopped the turn: ${stopReason}`,
          retryable: false,
        }
  return { type: 'runFailed', failure }
}

function safeFingerprint(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    throw invalidUpdate('ACP update could not be fingerprinted')
  }
}

function invalidUpdate(message: string): ConversationRuntimeError {
  return new ConversationRuntimeError('invalidState', message)
}
