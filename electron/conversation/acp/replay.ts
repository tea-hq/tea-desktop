import { Buffer } from 'node:buffer'

import type {
  ConversationEvent,
  ConversationTurn,
} from '../../../src/features/conversation/contracts'
import {
  createConversationTurn,
  reduceConversationTurn,
} from '../../../src/features/conversation/timelineReducer'
import { ConversationRuntimeError } from '../runtime'
import type { AcpSessionUpdateNotification } from './connection'
import { AcpEventProjector } from './projector'

const DEFAULT_MAX_UPDATES = 50_000
const DEFAULT_MAX_TURNS = 1_000
const DEFAULT_MAX_TEXT_BYTES = 16 * 1024 * 1024
const DEFAULT_MAX_UPDATE_BYTES = 256 * 1024

export interface AcpReplayLimits {
  maxUpdates?: number
  maxTurns?: number
  maxTextBytes?: number
  maxUpdateBytes?: number
}

export class AcpV1ReplayCollector {
  private readonly projector = new AcpEventProjector(1)
  private readonly turns: ConversationTurn[] = []
  private readonly maxUpdates: number
  private readonly maxTurns: number
  private readonly maxTextBytes: number
  private readonly maxUpdateBytes: number
  private updates = 0
  private textBytes = 0
  private sequence = 0
  private currentUserMessageId: string | null | undefined
  private phase: 'empty' | 'user' | 'output' = 'empty'
  private completed = false
  private failure: ConversationRuntimeError | null = null

  constructor(
    private readonly conversationId: string,
    private readonly sessionId: string,
    limits: AcpReplayLimits = {},
  ) {
    this.maxUpdates = positiveLimit(limits.maxUpdates, DEFAULT_MAX_UPDATES, 'update count')
    this.maxTurns = positiveLimit(limits.maxTurns, DEFAULT_MAX_TURNS, 'turn count')
    this.maxTextBytes = positiveLimit(limits.maxTextBytes, DEFAULT_MAX_TEXT_BYTES, 'text bytes')
    this.maxUpdateBytes = positiveLimit(
      limits.maxUpdateBytes,
      DEFAULT_MAX_UPDATE_BYTES,
      'update bytes',
    )
  }

  accept(input: AcpSessionUpdateNotification): void {
    if (this.failure) throw this.failure
    try {
      this.acceptOnce(input)
    } catch (cause) {
      this.failure =
        cause instanceof ConversationRuntimeError
          ? cause
          : invalidReplay('ACP replay projection failed')
      throw this.failure
    }
  }

  private acceptOnce(input: AcpSessionUpdateNotification): void {
    if (this.completed) throw invalidReplay('ACP replay already completed')
    if (input.wireVersion !== 1) throw invalidReplay('ACP replay used the wrong wire version')
    if (input.notification.sessionId !== this.sessionId) {
      throw invalidReplay(
        `ACP replay belongs to an unknown session: ${input.notification.sessionId}`,
      )
    }
    this.updates += 1
    if (this.updates > this.maxUpdates) throw invalidReplay('ACP replay update limit exceeded')
    if (serializedBytes(input.notification) > this.maxUpdateBytes) {
      throw invalidReplay('ACP replay update size limit exceeded')
    }

    const update = input.notification.update
    if (update.sessionUpdate === 'user_message_chunk') {
      this.acceptUserChunk(update)
      return
    }
    if (update.sessionUpdate === 'agent_message_chunk') {
      requireTextContent(update.content, 'agent message')
    } else if (update.sessionUpdate === 'agent_thought_chunk') {
      requireTextContent(update.content, 'agent thought')
    }

    const projected = this.projector.project(input)
    if (projected.terminal) {
      throw invalidReplay('ACP V1 replay contained an unexpected terminal update')
    }
    if (projected.events.length === 0) return
    if (this.phase === 'empty')
      throw invalidReplay('ACP replay output arrived before a user prompt')
    this.phase = 'output'
    for (const event of projected.events) {
      if (event.type === 'messageDelta' || event.type === 'thoughtDelta') this.addText(event.text)
      this.reduceCurrent(event)
    }
  }

  finish(): { turns: ConversationTurn[]; lastEventSequence: number } {
    if (this.failure) throw this.failure
    if (this.completed) throw invalidReplay('ACP replay already completed')
    this.completed = true
    if (this.turns.length === 0) throw invalidReplay('ACP replay was empty')
    this.completeCurrentTurn()
    for (const turn of this.turns) {
      if (
        turn.blocks.some(
          (block) =>
            block.kind === 'toolCall' &&
            (block.status === 'requested' ||
              block.status === 'running' ||
              block.status === 'approvalRequired'),
        )
      ) {
        throw invalidReplay('ACP replay ended with an unfinished tool call')
      }
    }
    return {
      turns: structuredClone(this.turns),
      lastEventSequence: this.sequence,
    }
  }

  private acceptUserChunk(update: { content: unknown; messageId?: string | null }): void {
    const text = requireTextContent(update.content, 'user message')
    const startsNewMessage =
      this.phase === 'empty' ||
      this.phase === 'output' ||
      (update.messageId != null &&
        this.currentUserMessageId != null &&
        update.messageId !== this.currentUserMessageId)
    if (startsNewMessage) this.startTurn(update.messageId)
    const current = this.requireCurrentTurn()
    this.addText(text)
    current.user.text += text
    this.phase = 'user'
  }

  private startTurn(messageId?: string | null): void {
    if (this.turns.length >= this.maxTurns) throw invalidReplay('ACP replay turn limit exceeded')
    if (this.turns.length > 0) this.completeCurrentTurn()
    const turnNumber = this.turns.length + 1
    let turn = createConversationTurn(
      `acp-replay-turn-${turnNumber}`,
      messageId?.trim() || `acp-replay-prompt-${turnNumber}`,
      '',
      [],
      this.sequence,
    )
    turn = reduceConversationTurn(turn, this.event({ type: 'runStarted' }))
    this.turns.push(turn)
    this.currentUserMessageId = messageId
    this.phase = 'user'
  }

  private completeCurrentTurn(): void {
    const current = this.requireCurrentTurn()
    if (!current.user.text.trim()) throw invalidReplay('ACP replay contains an empty user prompt')
    if (
      current.blocks.some(
        (block) =>
          block.kind === 'toolCall' &&
          (block.status === 'requested' ||
            block.status === 'running' ||
            block.status === 'approvalRequired'),
      )
    ) {
      throw invalidReplay('ACP replay ended with an unfinished tool call')
    }
    this.turns[this.turns.length - 1] = reduceConversationTurn(
      current,
      this.event({ type: 'runFinished' }),
    )
  }

  private reduceCurrent(kind: ConversationEvent['event']): void {
    const current = this.requireCurrentTurn()
    this.turns[this.turns.length - 1] = reduceConversationTurn(current, this.event(kind))
  }

  private event(kind: ConversationEvent['event']): ConversationEvent {
    return { conversationId: this.conversationId, sequence: ++this.sequence, event: kind }
  }

  private requireCurrentTurn(): ConversationTurn {
    const current = this.turns.at(-1)
    if (!current) throw invalidReplay('ACP replay output arrived before a user prompt')
    return current
  }

  private addText(value: string): void {
    this.textBytes += Buffer.byteLength(value, 'utf8')
    if (this.textBytes > this.maxTextBytes) throw invalidReplay('ACP replay text limit exceeded')
  }
}

function requireTextContent(content: unknown, label: string): string {
  if (!content || typeof content !== 'object') {
    throw invalidReplay(`ACP replay ${label} content is not representable`)
  }
  const value = content as { type?: unknown; text?: unknown }
  if (value.type !== 'text' || typeof value.text !== 'string') {
    throw invalidReplay(`ACP replay ${label} content is not representable`)
  }
  return value.text
}

function serializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    throw invalidReplay('ACP replay update could not be serialized')
  }
}

function positiveLimit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new ConversationRuntimeError('invalidConfiguration', `ACP replay ${label} is invalid`)
  }
  return resolved
}

function invalidReplay(message: string): ConversationRuntimeError {
  return new ConversationRuntimeError('invalidState', message)
}
