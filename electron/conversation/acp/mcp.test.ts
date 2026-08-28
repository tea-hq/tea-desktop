import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'

import type { HostToolCall, HostToolDefinition } from '../../../src/features/conversation/contracts'
import { ConversationToolBroker } from '../toolBroker'
import { AcpConversationMcpServer } from './mcpServer'

const TOOL: HostToolDefinition = {
  name: 'load_channel_messages',
  version: '1.0.0',
  description: 'Loads a bounded page of channel messages.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } },
    required: ['limit'],
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      messages: { type: 'array' },
      hasMore: { type: 'boolean' },
    },
    required: ['messages', 'hasMore'],
  },
}

describe('AcpConversationMcpServer', () => {
  it('discovers the selected HostTools through standard MCP', async () => {
    const harness = await createHarness([TOOL])
    try {
      await expect(harness.client.listTools()).resolves.toMatchObject({
        tools: [
          {
            name: TOOL.name,
            description: TOOL.description,
            inputSchema: TOOL.inputSchema,
            outputSchema: TOOL.outputSchema,
          },
        ],
      })
    } finally {
      await harness.close()
    }
  })

  it('returns structured content and standard text content for a successful call', async () => {
    const harness = await createHarness([TOOL])
    try {
      await harness.client.listTools()
      const resultPromise = harness.client.callTool({
        name: TOOL.name,
        arguments: { limit: 2 },
      })
      await vi.waitFor(() => expect(harness.calls).toHaveLength(1))
      harness.broker.resolve({
        conversationId: 'conversation-1',
        callId: harness.calls[0].callId,
        status: 'success',
        output: { messages: [], hasMore: false },
      })

      await expect(resultPromise).resolves.toMatchObject({
        structuredContent: { messages: [], hasMore: false },
        content: [{ type: 'text', text: '{"messages":[],"hasMore":false}' }],
      })
    } finally {
      await harness.close()
    }
  })

  it('maps invalid arguments and executor failures to MCP tool errors', async () => {
    const harness = await createHarness([TOOL])
    try {
      await expect(
        harness.client.callTool({ name: TOOL.name, arguments: { limit: 20 } }),
      ).resolves.toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'invalidRequest' }],
      })
      expect(harness.calls).toEqual([])

      const resultPromise = harness.client.callTool({
        name: TOOL.name,
        arguments: { limit: 2 },
      })
      await vi.waitFor(() => expect(harness.calls).toHaveLength(1))
      harness.broker.resolve({
        conversationId: 'conversation-1',
        callId: harness.calls[0].callId,
        status: 'failure',
        code: 'unavailable',
        message: 'Channel transport is unavailable',
      })
      await expect(resultPromise).resolves.toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'unavailable: Channel transport is unavailable' }],
      })
    } finally {
      await harness.close()
    }
  })

  it('preserves an explicit empty selection and invalidates a reconfigured scope', async () => {
    const empty = await createHarness([])
    try {
      await expect(empty.client.listTools()).resolves.toMatchObject({ tools: [] })
      await expect(
        empty.client.callTool({ name: TOOL.name, arguments: { limit: 1 } }),
      ).resolves.toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'unavailable' }],
      })
    } finally {
      await empty.close()
    }

    const configured = await createHarness([TOOL])
    try {
      configured.broker.configureConversation('conversation-1', [])
      await expect(configured.client.listTools()).resolves.toMatchObject({
        tools: [{ name: TOOL.name }],
      })
      await expect(
        configured.client.callTool({ name: TOOL.name, arguments: { limit: 1 } }),
      ).resolves.toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'unavailable' }],
      })
    } finally {
      await configured.close()
    }
  })

  it('forwards MCP cancellation to the broker call', async () => {
    const harness = await createHarness([TOOL])
    try {
      const controller = new AbortController()
      const resultPromise = harness.client.callTool(
        { name: TOOL.name, arguments: { limit: 1 } },
        undefined,
        { signal: controller.signal },
      )
      await vi.waitFor(() => expect(harness.calls).toHaveLength(1))
      controller.abort()
      await expect(resultPromise).rejects.toBeDefined()
      expect(() =>
        harness.broker.resolve({
          conversationId: 'conversation-1',
          callId: harness.calls[0].callId,
          status: 'success',
          output: { messages: [], hasMore: false },
        }),
      ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
    } finally {
      await harness.close()
    }
  })
})

async function createHarness(definitions: HostToolDefinition[]) {
  const calls: HostToolCall[] = []
  let nextCallId = 1
  const broker = new ConversationToolBroker((call) => calls.push(call), {
    createCallId: () => `call-${nextCallId++}`,
  })
  broker.configureConversation('conversation-1', definitions)
  const server = new AcpConversationMcpServer(broker.openScope('conversation-1'))
  const client = new Client({ name: 'tea-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return {
    broker,
    calls,
    client,
    close: async () => {
      broker.shutdown()
      await Promise.allSettled([client.close(), server.close()])
    },
  }
}
