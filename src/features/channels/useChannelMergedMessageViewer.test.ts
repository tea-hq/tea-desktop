import { describe, expect, it, vi } from 'vitest'
import type { Message } from './contracts'
import { useChannelMergedMessageViewer } from './useChannelMergedMessageViewer'

function merged(id: string): Message {
  return {
    ref: { channelRef: 'c1', messageClientId: id },
    sender: { id: 'u1', name: 'User', isCurrentUser: false },
    sentAt: 1,
    text: 'history',
    content: { kind: 'merged', sourceChannelName: id, abstracts: [], depth: 1 },
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
  }
}

describe('channel merged message viewer', () => {
  it('owns nested loading, back navigation, and retry state', async () => {
    const child = merged('child')
    const load = vi
      .fn<(ref: Message['ref']) => Promise<Message[]>>()
      .mockResolvedValueOnce([child])
      .mockRejectedValueOnce({ code: 'transport' })
      .mockResolvedValueOnce([])
    const viewer = useChannelMergedMessageViewer(load)

    await viewer.openMessage(merged('parent'))
    expect(viewer.items.value).toEqual([child])
    await viewer.openMessage(child)
    expect(viewer.errorCode.value).toBe('transport')
    expect(viewer.canGoBack.value).toBe(true)
    await viewer.retry()
    expect(viewer.items.value).toEqual([])
    expect(viewer.canGoBack.value).toBe(true)
    viewer.back()
    expect(viewer.items.value).toEqual([child])
  })

  it('drops a late load after the viewer closes', async () => {
    let release!: (messages: Message[]) => void
    const load = vi.fn(
      () =>
        new Promise<Message[]>((resolve) => {
          release = resolve
        }),
    )
    const viewer = useChannelMergedMessageViewer(load)
    const opening = viewer.openMessage(merged('parent'))
    viewer.close()
    release([merged('late')])
    await opening

    expect(viewer.open.value).toBe(false)
    expect(viewer.items.value).toEqual([])
  })
})
