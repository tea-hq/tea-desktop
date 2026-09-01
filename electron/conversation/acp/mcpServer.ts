import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

import type {
  HostToolDefinition,
  HostToolResult,
} from '../../../src/features/conversation/contracts'
import { ConversationRuntimeError } from '../runtime'
import type { ConversationToolScope } from '../toolBroker'

const SERVER_NAME = 'tea-conversation-tools'
const SERVER_VERSION = '1.0.0'

type McpServerState = 'new' | 'connecting' | 'connected' | 'closed'

export class AcpConversationMcpServer {
  private readonly server: Server
  private state: McpServerState = 'new'
  private closePromise: Promise<void> | null = null

  constructor(private readonly scope: ConversationToolScope) {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } },
    )
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.scope.definitions().map(toMcpTool),
    }))
    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      try {
        const result = await this.scope.call(request.params.name, request.params.arguments ?? {}, {
          signal: extra.signal,
        })
        return toMcpResult(result)
      } catch {
        return mcpFailure('unavailable')
      }
    })
  }

  async connect(transport: Transport): Promise<void> {
    if (this.state !== 'new') {
      throw new ConversationRuntimeError(
        'invalidState',
        `MCP server cannot connect from state: ${this.state}`,
      )
    }
    this.state = 'connecting'
    try {
      await this.server.connect(transport)
      this.state = 'connected'
    } catch (cause) {
      this.state = 'closed'
      await this.server.close().catch(() => undefined)
      throw new ConversationRuntimeError('connectionFailed', 'MCP server connection failed', true, {
        cause,
      })
    }
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeOnce()
    return this.closePromise
  }

  private async closeOnce(): Promise<void> {
    if (this.state === 'closed') return
    this.state = 'closed'
    await this.server.close()
  }
}

function toMcpTool(definition: HostToolDefinition): Tool {
  return {
    name: definition.name,
    description: definition.description,
    ...(definition.iconUrl ? { icons: [{ src: definition.iconUrl }] } : {}),
    inputSchema: structuredClone(definition.inputSchema) as Tool['inputSchema'],
    outputSchema: structuredClone(definition.outputSchema) as Tool['outputSchema'],
  }
}

function toMcpResult(result: HostToolResult): CallToolResult {
  if (result.status === 'failure') return mcpFailure(result.code, result.message)
  const output = structuredClone(result.output)
  return {
    structuredContent: output,
    content: [{ type: 'text', text: JSON.stringify(output) }],
  }
}

function mcpFailure(code: string, message?: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message ? `${code}: ${message}` : code }],
  }
}
