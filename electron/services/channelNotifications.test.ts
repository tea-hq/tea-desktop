import { describe, expect, it, vi } from 'vitest'

import type {
  ChannelEvent,
  ChannelNotificationSourceResolver,
  Message,
} from '../../src/features/channels/contracts'
import type { NotificationSettings } from '../../src/features/settings/contracts'
import { ChannelNotificationService, type ChannelNotificationOptions } from './channelNotifications'

function message(
  channelRef: string,
  clientId: string,
  sentAt: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    ref: { channelRef, messageClientId: clientId, messageServerId: 'server-' + clientId },
    sender: { id: 'sender', name: 'Sender', isCurrentUser: false },
    sentAt,
    text: 'Message ' + clientId,
    content: { kind: 'text', text: 'Message ' + clientId },
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [],
    ...overrides,
  }
}

function received(messages: Message[]): ChannelEvent {
  return { type: 'message.received', sequence: 1, occurredAt: 1, messages }
}

function factory() {
  const options: ChannelNotificationOptions[] = []
  const clicks: Array<() => void> = []
  const handles = new Set<{ close: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn> }>()
  return {
    options,
    clicks,
    handles,
    createNotification: vi.fn((value: ChannelNotificationOptions) => {
      options.push(value)
      const handle = {
        close: vi.fn(),
        show: vi.fn(),
        onClick: (listener: () => void) => clicks.push(listener),
        onClose: vi.fn(),
      }
      handles.add(handle)
      return handle
    }),
  }
}

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { enabled: true, sound: true, preview: 'message', ...overrides }
}

function resolver(): {
  resolver: ChannelNotificationSourceResolver
  resolve: ReturnType<typeof vi.fn>
} {
  const resolve = vi.fn(async (channelRef: string) => ({
    channelRef,
    channelName: 'Channel ' + channelRef,
    muted: false,
  }))
  return { resolver: { resolveNotificationContext: resolve }, resolve }
}

describe('ChannelNotificationService', () => {
  it('collapses a batch by channel and shows only newest eligible messages', async () => {
    const notifications = factory()
    const source = resolver()
    const activate = vi.fn()
    source.resolve.mockImplementation(async (channelRef: string) => ({
      channelRef,
      channelName: 'Channel ' + channelRef,
      muted: channelRef === 'muted',
    }))
    const service = new ChannelNotificationService({
      createNotification: notifications.createNotification,
      getSettings: () => settings(),
      isWindowFocused: () => false,
      resolver: source.resolver,
      onActivate: activate,
    })

    await service.handleEvent(
      received([
        message('design', 'old', 1),
        message('design', 'new', 2),
        message('self', 'self', 3, {
          sentByCurrentUser: true,
          sender: { id: 'me', name: 'Me', isCurrentUser: true },
        }),
        message('revoked', 'revoked', 4, { state: 'revoked' }),
        message('muted', 'muted', 5),
      ]),
    )

    expect(notifications.options).toEqual([
      { title: 'Channel design', body: 'Sender: Message new', silent: false },
    ])
    expect(notifications.createNotification).toHaveBeenCalledOnce()
    expect(source.resolve).toHaveBeenCalledTimes(2)
  })

  it('applies preview privacy, sound, focus, and disabled gates', async () => {
    const notifications = factory()
    const source = resolver()
    let current = settings({ preview: 'hidden', sound: false })
    let focused = false
    const service = new ChannelNotificationService({
      createNotification: notifications.createNotification,
      getSettings: () => current,
      isWindowFocused: () => focused,
      resolver: source.resolver,
      onActivate: vi.fn(),
    })

    await service.handleEvent(received([message('hidden', 'm1', 1)]))
    expect(notifications.options[0]).toEqual({
      title: 'Channel hidden',
      body: '',
      silent: true,
    })

    focused = true
    await service.handleEvent(received([message('focused', 'm2', 2)]))
    current = settings({ enabled: false })
    focused = false
    await service.handleEvent(received([message('disabled', 'm3', 3)]))
    expect(notifications.options).toHaveLength(1)
  })

  it('bounds per-batch work and deduplicates notification refs', async () => {
    const notifications = factory()
    const source = resolver()
    const service = new ChannelNotificationService({
      createNotification: notifications.createNotification,
      getSettings: () => settings({ preview: 'sender' }),
      isWindowFocused: () => false,
      resolver: source.resolver,
      onActivate: vi.fn(),
    })

    const batch = Array.from({ length: 25 }, (_, index) =>
      message('channel-' + index, 'm-' + index, index),
    )
    await service.handleEvent(received(batch))
    await service.handleEvent(received(batch))

    expect(notifications.options).toHaveLength(20)
    expect(source.resolve).toHaveBeenCalledTimes(20)
    expect(notifications.options.every((value) => value.body === 'Sender')).toBe(true)
  })

  it('activates and closes the matching notification, then disposes remaining handles', async () => {
    const notifications = factory()
    const source = resolver()
    const activate = vi.fn()
    const service = new ChannelNotificationService({
      createNotification: notifications.createNotification,
      getSettings: () => settings(),
      isWindowFocused: () => false,
      resolver: source.resolver,
      onActivate: activate,
    })

    await service.handleEvent(received([message('design', 'm1', 1)]))
    const handle = [...notifications.handles][0]!
    handle.show.mockClear()
    notifications.clicks[0]!()
    notifications.clicks[0]!()

    expect(activate).toHaveBeenCalledOnce()
    expect(activate).toHaveBeenCalledWith({
      channelRef: 'design',
      messageClientId: 'm1',
      messageServerId: 'server-m1',
    })
    expect(handle.close).toHaveBeenCalledOnce()
    await service.dispose()
    expect(handle.close).toHaveBeenCalledOnce()
  })

  it('fails closed when context lookup or notification construction fails', async () => {
    const notifications = factory()
    const source = resolver()
    source.resolve.mockRejectedValueOnce(new Error('offline'))
    notifications.createNotification.mockImplementationOnce(() => {
      throw new Error('unsupported')
    })
    const service = new ChannelNotificationService({
      createNotification: notifications.createNotification,
      getSettings: () => settings(),
      isWindowFocused: () => false,
      resolver: source.resolver,
      onActivate: vi.fn(),
    })

    await service.handleEvent(received([message('offline', 'm1', 1)]))
    await service.handleEvent(received([message('construction', 'm2', 2)]))

    expect(notifications.options).toHaveLength(0)
    expect(notifications.handles.size).toBe(0)
  })
})
