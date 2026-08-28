import type { HostToolDefinition } from './contracts'

export const CHANNEL_HISTORY_TOOL_NAME = 'load_channel_messages'

export const channelHistoryToolDefinition: HostToolDefinition = {
  name: CHANNEL_HISTORY_TOOL_NAME,
  version: '1.0.0',
  description:
    'Loads a bounded page of messages from the bound Channel when the available sources are insufficient. Omit the cursor with direction before to load the latest messages.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      direction: { type: 'string', enum: ['before', 'after'] },
      cursor: {
        type: 'object',
        additionalProperties: false,
        properties: {
          messageClientId: { type: 'string', maxLength: 512 },
          messageServerId: { type: 'string', maxLength: 512 },
        },
        required: ['messageClientId'],
      },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['direction'],
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      direction: { type: 'string' },
      messages: { type: 'array' },
      hasMore: { type: 'boolean' },
      nextCursor: { type: ['object', 'null'] },
    },
    required: ['direction', 'messages', 'hasMore', 'nextCursor'],
  },
}
