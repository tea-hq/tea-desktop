import type * as acpV1 from '@agentclientprotocol/sdk'
import type * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'
import { describe, expect, it } from 'vitest'

import { AcpEventProjector } from './projector'

describe('AcpEventProjector', () => {
  it('projects V1 text and ordered tool lifecycle updates', () => {
    const projector = new AcpEventProjector(1)

    expect(
      projector.project(
        v1Update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello' },
        }),
      ),
    ).toEqual({ events: [{ type: 'messageDelta', text: 'Hello' }] })

    const requested = v1Update({
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-1',
      title: 'Read file',
      kind: 'read',
      status: 'pending',
      rawInput: { path: '/workspace/README.md' },
    })
    expect(projector.project(requested)).toEqual({
      events: [
        {
          type: 'toolRequested',
          toolCallId: 'tool-1',
          name: 'Read file',
          arguments: { path: '/workspace/README.md' },
        },
      ],
    })
    expect(projector.project(requested)).toEqual({ events: [] })

    expect(
      projector.project(
        v1Update({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: 'Read complete' } }],
        }),
      ),
    ).toEqual({
      events: [
        {
          type: 'toolCompleted',
          toolCallId: 'tool-1',
          status: 'completed',
          message: 'Read complete',
        },
      ],
    })

    expect(() =>
      projector.project(
        v1Update({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'in_progress',
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
  })

  it('projects V1 thought chunks as a separate visible timeline event', () => {
    const projector = new AcpEventProjector(1)

    expect(
      projector.project(
        v1Update({
          sessionUpdate: 'agent_thought_chunk',
          messageId: 'thought-1',
          content: { type: 'text', text: 'Inspecting the request.' },
        }),
      ),
    ).toEqual({
      events: [{ type: 'thoughtDelta', messageId: 'thought-1', text: 'Inspecting the request.' }],
    })
  })

  it('applies V2 message upserts without duplicating already projected text', () => {
    const projector = new AcpEventProjector(2)

    expect(
      projector.project(
        v2Update({
          sessionUpdate: 'agent_message_chunk',
          messageId: 'message-1',
          content: { type: 'text', text: 'Hello' },
        }),
      ),
    ).toEqual({ events: [{ type: 'messageDelta', text: 'Hello' }] })
    const replacement = v2Update({
      sessionUpdate: 'agent_message',
      messageId: 'message-1',
      content: [{ type: 'text', text: 'Hello world' }],
    })
    expect(projector.project(replacement)).toEqual({
      events: [{ type: 'messageDelta', text: ' world' }],
    })
    expect(projector.project(replacement)).toEqual({ events: [] })

    expect(() =>
      projector.project(
        v2Update({
          sessionUpdate: 'agent_message',
          messageId: 'message-1',
          content: [{ type: 'text', text: 'Replacement' }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
  })

  it('projects V2 thought chunks and replacement updates', () => {
    const projector = new AcpEventProjector(2)

    expect(
      projector.project(
        v2Update({
          sessionUpdate: 'agent_thought_chunk',
          messageId: 'thought-1',
          content: { type: 'text', text: 'First pass' },
        }),
      ),
    ).toEqual({ events: [{ type: 'thoughtDelta', messageId: 'thought-1', text: 'First pass' }] })
    expect(
      projector.project(
        v2Update({
          sessionUpdate: 'agent_thought',
          messageId: 'thought-1',
          content: [{ type: 'text', text: 'Revised pass' }],
        }),
      ),
    ).toEqual({
      events: [
        { type: 'thoughtDelta', messageId: 'thought-1', replace: true, text: 'Revised pass' },
      ],
    })
  })

  it('uses V1 prompt stops and V2 idle state as terminal outcomes', () => {
    const v1 = new AcpEventProjector(1)
    const v2 = new AcpEventProjector(2)

    expect(v1.terminalFromV1('cancelled')).toEqual({
      type: 'runFailed',
      failure: { code: 'cancelled', retryable: false },
    })
    expect(
      v2.project(
        v2Update({
          sessionUpdate: 'state_update',
          state: 'idle',
          stopReason: 'end_turn',
        }),
      ),
    ).toEqual({ events: [], terminal: { type: 'runFinished' } })
  })

  it('rejects updates from a different negotiated wire version', () => {
    const projector = new AcpEventProjector(1)

    expect(() =>
      projector.project(
        v2Update({
          sessionUpdate: 'state_update',
          state: 'running',
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
  })
})

function v1Update(update: acpV1.SessionUpdate) {
  return {
    wireVersion: 1 as const,
    notification: { sessionId: 'session-1', update },
  }
}

function v2Update(update: acpV2.SessionUpdate) {
  return {
    wireVersion: 2 as const,
    notification: { sessionId: 'session-2', update },
  }
}
