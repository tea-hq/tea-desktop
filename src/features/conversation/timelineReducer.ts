import type {
  ApprovalDecision,
  ApprovalRequest,
  ConversationEvent,
  ConversationFailure,
  ConversationTurn,
  ConversationTurnBlock,
  ToolCallBlock,
} from './contracts'

export function createConversationTurn(
  id: string,
  promptId: string,
  text: string,
  attachments: string[],
  lastEventSequence = 0,
): ConversationTurn {
  return {
    id,
    user: { id: promptId, text, attachments },
    blocks: [],
    status: 'sending',
    lastEventSequence,
  }
}

export function reduceConversationTurn(
  turn: ConversationTurn,
  incoming: ConversationEvent,
): ConversationTurn {
  if (incoming.sequence <= turn.lastEventSequence) return turn

  const event = incoming.event
  const next = { ...turn, lastEventSequence: incoming.sequence }

  if (event.type === 'runStarted') {
    return { ...next, status: 'running' }
  }

  if (event.type === 'messageDelta') {
    const last = next.blocks.at(-1)
    if (last?.kind === 'assistantText' && last.streaming) {
      const updated = replaceBlock(next.blocks, last.id, {
        ...last,
        text: last.text + event.text,
        streaming: event.terminal !== true,
      })
      return {
        ...next,
        status: event.terminal === true ? 'completed' : 'running',
        blocks: event.terminal === true ? closeTurnBlocks(updated, 'completed') : updated,
      }
    }
    const blocks = [
      ...next.blocks,
      {
        kind: 'assistantText' as const,
        id: `${turn.id}-assistant-${incoming.sequence}`,
        sequence: incoming.sequence,
        text: event.text,
        streaming: event.terminal !== true,
      },
    ]
    return {
      ...next,
      status: event.terminal === true ? 'completed' : 'running',
      blocks: event.terminal === true ? closeTurnBlocks(blocks, 'completed') : blocks,
    }
  }

  if (event.type === 'thoughtDelta') {
    const last = next.blocks.at(-1)
    const sameThought =
      last?.kind === 'agentThought' &&
      last.streaming &&
      (last.messageId ?? null) === (event.messageId ?? null)
    if (sameThought && !event.replace) {
      return {
        ...next,
        status: 'running',
        blocks: replaceBlock(next.blocks, last.id, { ...last, text: last.text + event.text }),
      }
    }
    if (event.replace && last?.kind === 'agentThought' && last.messageId === event.messageId) {
      if (!event.text) {
        return {
          ...next,
          status: 'running',
          blocks: next.blocks.filter((block) => block.id !== last.id),
        }
      }
      return {
        ...next,
        status: 'running',
        blocks: replaceBlock(next.blocks, last.id, { ...last, text: event.text, streaming: true }),
      }
    }
    if (!event.text) return next
    return {
      ...next,
      status: 'running',
      blocks: [
        ...closeStreamingText(next.blocks),
        {
          kind: 'agentThought',
          id: `${turn.id}-thought-${incoming.sequence}`,
          sequence: incoming.sequence,
          text: event.text,
          streaming: true,
          messageId: event.messageId,
        },
      ],
    }
  }

  if (event.type === 'toolRequested') {
    const existing = findTool(next.blocks, event.toolCallId)
    if (existing) {
      return {
        ...next,
        status: 'running',
        blocks: replaceBlock(next.blocks, existing.id, {
          ...existing,
          name: event.name,
          arguments: event.arguments,
        }),
      }
    }
    return {
      ...next,
      status: 'running',
      blocks: [
        ...closeStreamingText(next.blocks),
        {
          kind: 'toolCall',
          id: event.toolCallId,
          sequence: incoming.sequence,
          name: event.name,
          arguments: event.arguments,
          status: 'requested',
        },
      ],
    }
  }

  if (event.type === 'toolProgress') {
    const existing = findTool(next.blocks, event.toolCallId)
    const tool: ToolCallBlock = existing
      ? {
          ...existing,
          status: 'running',
          message: event.message,
          completedUnits: event.completedUnits,
          totalUnits: event.totalUnits,
        }
      : {
          kind: 'toolCall',
          id: event.toolCallId,
          sequence: incoming.sequence,
          name: 'tool',
          status: 'running',
          message: event.message,
          completedUnits: event.completedUnits,
          totalUnits: event.totalUnits,
        }
    return {
      ...next,
      status: 'running',
      blocks: existing
        ? replaceBlock(next.blocks, existing.id, tool)
        : [...closeStreamingText(next.blocks), tool],
    }
  }

  if (event.type === 'toolCompleted') {
    const existing = findTool(next.blocks, event.toolCallId)
    if (!existing) {
      return next
    }
    return {
      ...next,
      blocks: replaceBlock(next.blocks, existing.id, {
        ...existing,
        status: event.status,
        message: event.message,
        approval: undefined,
      }),
    }
  }

  if (event.type === 'approvalRequested') {
    const existing = findTool(next.blocks, event.toolCallId)
    const request: ApprovalRequest = {
      id: event.approvalId,
      toolCallId: event.toolCallId,
      toolName: existing?.name ?? 'tool',
      capabilities: event.capabilities,
      resources: event.resources,
      decisions: event.decisions,
      status: 'pending',
    }
    const tool: ToolCallBlock = existing
      ? { ...existing, status: 'approvalRequired', approval: request }
      : {
          kind: 'toolCall',
          id: event.toolCallId,
          sequence: incoming.sequence,
          name: 'tool',
          status: 'approvalRequired',
          approval: request,
        }
    return {
      ...next,
      status: 'running',
      blocks: existing
        ? replaceBlock(next.blocks, existing.id, tool)
        : [...closeStreamingText(next.blocks), tool],
    }
  }

  if (event.type === 'runFinished') {
    return {
      ...next,
      status: 'completed',
      blocks: closeTurnBlocks(next.blocks, 'completed'),
    }
  }

  const status = event.failure.code === 'cancelled' ? 'cancelled' : 'failed'
  return {
    ...next,
    status,
    blocks: [
      ...closeTurnBlocks(next.blocks, status),
      {
        kind: 'failureTip',
        id: `${turn.id}-failure-${incoming.sequence}`,
        sequence: incoming.sequence,
        failure: event.failure,
      },
    ],
  }
}

export function findApproval(
  turn: ConversationTurn,
  approvalId: string,
): ApprovalRequest | undefined {
  return turn.blocks.find(
    (block): block is ToolCallBlock =>
      block.kind === 'toolCall' && block.approval?.id === approvalId,
  )?.approval
}

export function setApprovalResolving(
  turn: ConversationTurn,
  approvalId: string,
  decision: ApprovalDecision,
): ConversationTurn {
  return updateApproval(turn, approvalId, (approval) => ({
    ...approval,
    status: 'resolving',
    decision,
    error: undefined,
  }))
}

export function setApprovalFailed(
  turn: ConversationTurn,
  approvalId: string,
  error: string,
): ConversationTurn {
  return updateApproval(turn, approvalId, (approval) => ({
    ...approval,
    status: 'failed',
    error,
  }))
}

export function completeApproval(
  turn: ConversationTurn,
  approvalId: string,
  decision: ApprovalDecision,
): ConversationTurn {
  const blocks = turn.blocks.map((block) => {
    if (block.kind !== 'toolCall' || block.approval?.id !== approvalId) return block
    return {
      ...block,
      status:
        decision === 'allowOnce' || decision === 'allowSession'
          ? ('running' as const)
          : ('cancelled' as const),
      approval: undefined,
    }
  })
  return decision === 'cancel'
    ? { ...turn, status: 'cancelled', blocks: closeTurnBlocks(blocks, 'cancelled') }
    : { ...turn, blocks }
}

export function cancelConversationTurn(turn: ConversationTurn): ConversationTurn {
  return {
    ...turn,
    status: 'cancelled',
    blocks: closeTurnBlocks(turn.blocks, 'cancelled'),
  }
}

export function failConversationTurn(
  turn: ConversationTurn,
  failure: ConversationFailure,
): ConversationTurn {
  return {
    ...turn,
    status: 'failed',
    blocks: [
      ...closeTurnBlocks(turn.blocks, 'failed'),
      {
        kind: 'failureTip',
        id: `${turn.id}-local-failure`,
        sequence: turn.lastEventSequence,
        failure,
      },
    ],
  }
}

function updateApproval(
  turn: ConversationTurn,
  approvalId: string,
  update: (approval: ApprovalRequest) => ApprovalRequest,
): ConversationTurn {
  return {
    ...turn,
    blocks: turn.blocks.map((block) =>
      block.kind === 'toolCall' && block.approval?.id === approvalId
        ? { ...block, approval: update(block.approval) }
        : block,
    ),
  }
}

function findTool(blocks: ConversationTurnBlock[], toolCallId: string): ToolCallBlock | undefined {
  return blocks.find(
    (block): block is ToolCallBlock => block.kind === 'toolCall' && block.id === toolCallId,
  )
}

function replaceBlock(
  blocks: ConversationTurnBlock[],
  id: string,
  replacement: ConversationTurnBlock,
): ConversationTurnBlock[] {
  return blocks.map((block) => (block.id === id ? replacement : block))
}

function closeStreamingText(blocks: ConversationTurnBlock[]): ConversationTurnBlock[] {
  return blocks.map((block) =>
    (block.kind === 'assistantText' || block.kind === 'agentThought') && block.streaming
      ? { ...block, streaming: false }
      : block,
  )
}

function closeTurnBlocks(
  blocks: ConversationTurnBlock[],
  terminal: 'completed' | 'failed' | 'cancelled',
): ConversationTurnBlock[] {
  return closeStreamingText(blocks).map((block) => {
    if (block.kind !== 'toolCall') return block
    if (!['requested', 'running', 'approvalRequired'].includes(block.status)) {
      return { ...block, approval: undefined }
    }
    return {
      ...block,
      status:
        terminal === 'completed'
          ? block.status === 'approvalRequired'
            ? ('cancelled' as const)
            : ('completed' as const)
          : terminal,
      approval: undefined,
    }
  })
}
