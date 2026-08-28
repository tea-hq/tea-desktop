#!/usr/bin/env node
import { Readable, Writable } from 'node:stream'

import * as acp from '@agentclientprotocol/sdk'

const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
const application = acp
  .agent({ name: 'tea-test-agent' })
  .onRequest(acp.methods.agent.initialize, ({ params }) => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {},
    agentInfo: { name: 'tea-test-agent', version: '1.0.0' },
    _meta: { requestedProtocolVersion: params.protocolVersion },
  }))
  .onRequest(acp.methods.agent.session.new, () => ({ sessionId: 'session-v1' }))
  .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'fixture response' },
      },
    })
    const permission = await client.request(acp.methods.client.session.requestPermission, {
      sessionId: params.sessionId,
      toolCall: {
        toolCallId: 'fixture-tool',
        title: 'Fixture tool',
        kind: 'read',
        status: 'pending',
      },
      options: [{ optionId: 'fixture-allow', name: 'Allow', kind: 'allow_once' }],
    })
    return {
      stopReason: permission.outcome.outcome === 'selected' ? 'end_turn' : 'cancelled',
    }
  })
const connection = application.connect(stream)

await connection.closed
