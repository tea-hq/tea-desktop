import { describe, expect, it, vi } from 'vitest'

import { DesktopEventPublisher, type DesktopEventTarget } from './events'

describe('DesktopEventPublisher', () => {
  it('publishes only through the typed event channel and clones the payload', () => {
    const send = vi.fn()
    const target = { isDestroyed: () => false, send } as unknown as DesktopEventTarget
    const publisher = new DesktopEventPublisher(() => target)
    const summary = {
      conversationId: 'conversation-1',
      runtimeId: 'external.codex',
      workspaceId: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }

    publisher.publish('conversation:updated', summary)
    summary.updatedAt = 2

    expect(send).toHaveBeenCalledWith('tea:event:conversation:updated', {
      ...summary,
      updatedAt: 1,
    })
  })

  it('drops events when no live renderer exists', () => {
    const send = vi.fn()
    const destroyed = { isDestroyed: () => true, send } as unknown as DesktopEventTarget
    new DesktopEventPublisher(() => destroyed).publish('conversation:event', {
      conversationId: 'conversation-1',
      sequence: 1,
      event: { type: 'runStarted' },
    })
    new DesktopEventPublisher(() => null).publish('conversation:updated', {
      conversationId: 'conversation-1',
      runtimeId: 'external.codex',
      workspaceId: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    })
    expect(send).not.toHaveBeenCalled()
  })
})
