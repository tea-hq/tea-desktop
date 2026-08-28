import * as acpV1 from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'

import type { AcpSessionUpdateNotification } from './connection'
import { AcpV1ReplayCollector } from './replay'

describe('AcpV1ReplayCollector', () => {
  it('projects complete multi-turn replay through the Tea timeline reducer', () => {
    const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
    collector.accept(update(user('First ')))
    collector.accept(update(user('question')))
    collector.accept(update(agent('Answer one.')))
    collector.accept(
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Read file',
        status: 'pending',
        rawInput: { path: '/workspace/file.txt' },
      }),
    )
    collector.accept(
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        status: 'completed',
        rawOutput: 'done',
      }),
    )
    collector.accept(update(user('Second question', 'user-2')))
    collector.accept(update(agent('Answer two.')))

    const replay = collector.finish()

    expect(replay.turns).toHaveLength(2)
    expect(replay.turns[0]).toMatchObject({
      user: { text: 'First question' },
      status: 'completed',
      blocks: [
        { kind: 'assistantText', text: 'Answer one.', streaming: false },
        { kind: 'toolCall', id: 'tool-1', status: 'completed' },
      ],
    })
    expect(replay.turns[1]).toMatchObject({
      user: { id: 'user-2', text: 'Second question' },
      status: 'completed',
      blocks: [{ kind: 'assistantText', text: 'Answer two.', streaming: false }],
    })
    expect(replay.lastEventSequence).toBeGreaterThan(0)
  })

  it('deduplicates repeated tool updates through the ACP projector', () => {
    const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
    const tool = {
      sessionUpdate: 'tool_call' as const,
      toolCallId: 'tool-1',
      title: 'Search',
      status: 'completed' as const,
    }
    collector.accept(update(user('Find it')))
    collector.accept(update(tool))
    collector.accept(update(tool))

    const replay = collector.finish()

    expect(replay.turns[0].blocks.filter((block) => block.kind === 'toolCall')).toHaveLength(1)
  })

  it.each([
    [
      'wrong session',
      () => {
        const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
        collector.accept(update(user('Hello'), 'session-2'))
      },
    ],
    [
      'wrong wire version',
      () => {
        const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
        collector.accept({
          wireVersion: 2,
          notification: {
            sessionId: 'session-1',
            update: {
              sessionUpdate: 'agent_message_chunk',
              messageId: 'message-1',
              content: { type: 'text', text: 'Hello' },
            },
          },
        })
      },
    ],
    [
      'output before prompt',
      () => {
        const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
        collector.accept(update(agent('Hello')))
      },
    ],
    [
      'unsupported visible content',
      () => {
        const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
        collector.accept(
          update({
            sessionUpdate: 'user_message_chunk',
            content: { type: 'image', data: 'synthetic', mimeType: 'image/png' },
          }),
        )
      },
    ],
    ['empty replay', () => new AcpV1ReplayCollector('conversation-1', 'session-1').finish()],
    [
      'unfinished tool',
      () => {
        const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
        collector.accept(update(user('Run it')))
        collector.accept(
          update({
            sessionUpdate: 'tool_call',
            toolCallId: 'tool-1',
            title: 'Run',
            status: 'in_progress',
          }),
        )
        collector.finish()
      },
    ],
  ])('rejects %s', (_name, action) => {
    expect(action).toThrowError(expect.objectContaining({ code: 'invalidState' }))
  })

  it('enforces deterministic replay bounds', () => {
    const updates = new AcpV1ReplayCollector('conversation-1', 'session-1', { maxUpdates: 1 })
    updates.accept(update(user('a')))
    expect(() => updates.accept(update(user('b')))).toThrow(/update limit/)

    const turns = new AcpV1ReplayCollector('conversation-1', 'session-1', { maxTurns: 1 })
    turns.accept(update(user('first', 'user-1')))
    turns.accept(update(agent('answer')))
    expect(() => turns.accept(update(user('second', 'user-2')))).toThrow(/turn limit/)

    const text = new AcpV1ReplayCollector('conversation-1', 'session-1', { maxTextBytes: 3 })
    expect(() => text.accept(update(user('four')))).toThrow(/text limit/)

    const bytes = new AcpV1ReplayCollector('conversation-1', 'session-1', {
      maxUpdateBytes: 32,
    })
    expect(() => bytes.accept(update(user('large update')))).toThrow(/update size limit/)
  })

  it('latches the first malformed update so partial replay cannot later finish', () => {
    const collector = new AcpV1ReplayCollector('conversation-1', 'session-1')
    collector.accept(update(user('Valid prompt')))

    expect(() => collector.accept(update(agent('Wrong owner'), 'other-session'))).toThrow(
      /unknown session/,
    )
    expect(() => collector.finish()).toThrow(/unknown session/)
  })
})

function update(value: acpV1.SessionUpdate, sessionId = 'session-1'): AcpSessionUpdateNotification {
  return { wireVersion: 1, notification: { sessionId, update: value } }
}

function user(text: string, messageId?: string): acpV1.SessionUpdate {
  return {
    sessionUpdate: 'user_message_chunk',
    content: { type: 'text', text },
    ...(messageId ? { messageId } : {}),
  }
}

function agent(text: string): acpV1.SessionUpdate {
  return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }
}
