import type * as acpV1 from '@agentclientprotocol/sdk'
import type * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'
import { describe, expect, it, vi } from 'vitest'

import type { ConversationEventKind } from '../../../src/features/conversation/contracts'
import { AcpPermissionCoordinator } from './permissions'

describe('AcpPermissionCoordinator', () => {
  it('preserves the exact V1 option id selected by a Tea decision', async () => {
    const coordinator = new AcpPermissionCoordinator(() => 'approval-1')
    const events: ConversationEventKind[] = []
    const response = coordinator.request(
      'conversation-1',
      v1Permission([
        { optionId: 'allow-exact', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'deny-exact', name: 'Deny', kind: 'reject_once' },
      ]),
      (event) => events.push(event),
    )

    expect(events).toEqual([
      {
        type: 'approvalRequested',
        approvalId: 'approval-1',
        toolCallId: 'tool-1',
        capabilities: ['edit'],
        resources: ['/workspace/file.txt'],
        decisions: ['allowOnce', 'deny', 'cancel'],
      },
    ])
    coordinator.resolve('conversation-1', 'approval-1', 'allowOnce')
    await expect(response).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow-exact' },
    })
  })

  it('does not substitute a permission decision the Agent did not offer', async () => {
    const coordinator = new AcpPermissionCoordinator(() => 'approval-1')
    const response = coordinator.request(
      'conversation-1',
      v1Permission([{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }]),
      vi.fn(),
    )

    expect(() => coordinator.resolve('conversation-1', 'approval-1', 'allowSession')).toThrowError(
      expect.objectContaining({ code: 'invalidState' }),
    )
    coordinator.resolve('conversation-1', 'approval-1', 'cancel')
    await expect(response).resolves.toEqual({ outcome: { outcome: 'cancelled' } })
  })

  it('rejects ambiguous option mappings and V2 subjects without a tool identity', () => {
    const coordinator = new AcpPermissionCoordinator(() => 'approval-1')
    expect(() =>
      coordinator.request(
        'conversation-1',
        v1Permission([
          { optionId: 'one', name: 'One', kind: 'allow_once' },
          { optionId: 'two', name: 'Two', kind: 'allow_once' },
        ]),
        vi.fn(),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))

    expect(() =>
      coordinator.request(
        'conversation-1',
        {
          wireVersion: 2,
          requestId: 2,
          request: {
            sessionId: 'session-1',
            title: 'Run command',
            subject: { type: 'command', command: 'npm test', cwd: '/workspace' },
            options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
          } satisfies acpV2.RequestPermissionRequest,
        },
        vi.fn(),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidState' }))
  })

  it('rejects a permission resource outside the ACP absolute-path contract', () => {
    const coordinator = new AcpPermissionCoordinator(() => 'approval-1')
    const request = v1Permission([{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }])
    request.request.toolCall.locations = [{ path: '../file.txt' }]

    expect(() => coordinator.request('conversation-1', request, vi.fn())).toThrowError(
      expect.objectContaining({ code: 'invalidState' }),
    )
  })
})

function v1Permission(options: acpV1.PermissionOption[]) {
  return {
    wireVersion: 1 as const,
    requestId: 1,
    request: {
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'tool-1',
        title: 'Edit file',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: '/workspace/file.txt' }],
      },
      options,
    } satisfies acpV1.RequestPermissionRequest,
  }
}
