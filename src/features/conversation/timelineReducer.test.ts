import { describe, expect, it } from 'vitest'

import type { ConversationEvent } from './contracts'
import {
  completeApproval,
  createConversationTurn,
  findApproval,
  reduceConversationTurn,
  setApprovalFailed,
  setApprovalResolving,
} from './timelineReducer'

function event(sequence: number, value: ConversationEvent['event']): ConversationEvent {
  return { conversationId: 'conversation-1', sequence, event: value }
}

describe('conversation timeline reducer', () => {
  it('keeps assistant text and tool calls in event order', () => {
    let turn = createConversationTurn('turn-1', 'prompt-1', 'Do the work', [])
    const events: ConversationEvent[] = [
      event(1, { type: 'runStarted' }),
      event(2, { type: 'messageDelta', text: 'First thought.' }),
      event(3, {
        type: 'toolRequested',
        toolCallId: 'tool-1',
        name: 'read',
        arguments: { path: 'one.txt' },
      }),
      event(4, {
        type: 'toolProgress',
        toolCallId: 'tool-1',
        message: 'Read one.txt',
        completedUnits: 1,
        totalUnits: 1,
      }),
      event(5, { type: 'messageDelta', text: 'Second thought.' }),
      event(6, {
        type: 'toolRequested',
        toolCallId: 'tool-2',
        name: 'write',
        arguments: { path: 'two.txt' },
      }),
      event(7, { type: 'messageDelta', text: 'Done.' }),
    ]

    for (const incoming of events) turn = reduceConversationTurn(turn, incoming)

    expect(turn.blocks.map((block) => block.kind)).toEqual([
      'assistantText',
      'toolCall',
      'assistantText',
      'toolCall',
      'assistantText',
    ])
    expect(turn.blocks.map((block) => block.sequence)).toEqual([2, 3, 5, 6, 7])
    expect(turn.blocks[0]).toMatchObject({ text: 'First thought.', streaming: false })
    expect(turn.blocks[1]).toMatchObject({ status: 'running', message: 'Read one.txt' })
    expect(turn.blocks[2]).toMatchObject({ text: 'Second thought.', streaming: false })
    expect(turn.blocks[4]).toMatchObject({ text: 'Done.', streaming: true })
  })

  it('keeps thought text separate from the assistant response', () => {
    let turn = createConversationTurn('turn-1', 'prompt-1', 'Review the change', [])
    turn = reduceConversationTurn(
      turn,
      event(1, { type: 'thoughtDelta', messageId: 'thought-1', text: 'Inspecting ' }),
    )
    turn = reduceConversationTurn(
      turn,
      event(2, { type: 'thoughtDelta', messageId: 'thought-1', text: 'the files.' }),
    )
    turn = reduceConversationTurn(turn, event(3, { type: 'messageDelta', text: 'Done.' }))
    turn = reduceConversationTurn(turn, event(4, { type: 'runFinished' }))

    expect(turn.blocks).toMatchObject([
      { kind: 'agentThought', text: 'Inspecting the files.', streaming: false },
      { kind: 'assistantText', text: 'Done.', streaming: false },
    ])
  })

  it('attaches approval state to its tool and removes only the controls after success', () => {
    let turn = createConversationTurn('turn-1', 'prompt-1', 'Write a file', [])
    turn = reduceConversationTurn(
      turn,
      event(1, {
        type: 'toolRequested',
        toolCallId: 'tool-1',
        name: 'write',
        arguments: { path: 'one.txt' },
      }),
    )
    turn = reduceConversationTurn(
      turn,
      event(2, {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-1',
        capabilities: ['filesystem.write'],
        resources: ['one.txt'],
        decisions: ['allowOnce'],
      }),
    )

    expect(findApproval(turn, 'approval-1')).toMatchObject({ status: 'pending' })
    turn = setApprovalResolving(turn, 'approval-1', 'allowOnce')
    expect(findApproval(turn, 'approval-1')).toMatchObject({ status: 'resolving' })
    turn = setApprovalFailed(turn, 'approval-1', 'transport failed')
    expect(findApproval(turn, 'approval-1')).toMatchObject({
      status: 'failed',
      error: 'transport failed',
    })
    turn = completeApproval(turn, 'approval-1', 'allowOnce')

    expect(findApproval(turn, 'approval-1')).toBeUndefined()
    expect(turn.blocks[0]).toMatchObject({ kind: 'toolCall', status: 'running' })
  })

  it('ignores duplicate and late sequence values', () => {
    let turn = createConversationTurn('turn-1', 'prompt-1', 'Hello', [])
    turn = reduceConversationTurn(turn, event(2, { type: 'messageDelta', text: 'new' }))
    const unchanged = reduceConversationTurn(
      turn,
      event(1, { type: 'messageDelta', text: 'stale' }),
    )

    expect(unchanged).toBe(turn)
    expect(unchanged.blocks[0]).toMatchObject({ text: 'new' })
  })

  it('closes text, tools, and approvals when a run terminates', () => {
    let turn = createConversationTurn('turn-1', 'prompt-1', 'Write a file', [])
    turn = reduceConversationTurn(turn, event(1, { type: 'messageDelta', text: 'Working.' }))
    turn = reduceConversationTurn(
      turn,
      event(2, {
        type: 'toolRequested',
        toolCallId: 'tool-1',
        name: 'write',
        arguments: {},
      }),
    )
    turn = reduceConversationTurn(
      turn,
      event(3, {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-1',
        capabilities: ['filesystem.write'],
        resources: [],
        decisions: ['allowOnce'],
      }),
    )
    turn = reduceConversationTurn(turn, event(4, { type: 'runFinished' }))

    expect(turn.status).toBe('completed')
    expect(turn.blocks[0]).toMatchObject({ kind: 'assistantText', streaming: false })
    expect(turn.blocks[1]).toMatchObject({
      kind: 'toolCall',
      status: 'cancelled',
      approval: undefined,
    })
  })

  it('records host tool completion before the assistant continues', () => {
    let turn = createConversationTurn('turn-1', 'prompt-1', 'Inspect history', [])
    turn = reduceConversationTurn(
      turn,
      event(1, {
        type: 'toolRequested',
        toolCallId: 'tool-1',
        name: 'load_channel_messages',
        arguments: { direction: 'before' },
      }),
    )
    turn = reduceConversationTurn(
      turn,
      event(2, {
        type: 'toolCompleted',
        toolCallId: 'tool-1',
        status: 'completed',
      }),
    )

    expect(turn.blocks[0]).toMatchObject({
      kind: 'toolCall',
      id: 'tool-1',
      status: 'completed',
    })
  })
})
