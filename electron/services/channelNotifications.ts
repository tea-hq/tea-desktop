import type {
  ChannelEvent,
  ChannelNotificationContext,
  ChannelNotificationSourceResolver,
  Message,
  MessageRef,
} from '../../src/features/channels/contracts'
import type { NotificationSettings } from '../../src/features/settings/contracts'

const MAX_CHANNELS_PER_BATCH = 20
const MAX_DEDUPE_KEYS = 512
const MAX_TITLE_LENGTH = 120
const MAX_BODY_LENGTH = 240

export interface ChannelNotificationOptions {
  title: string
  body: string
  silent: boolean
}

export interface ChannelNotificationHandle {
  show(): void
  close(): void
  onClick(listener: () => void): void
  onClose(listener: () => void): void
}

export type ChannelNotificationFactory = (
  options: ChannelNotificationOptions,
) => ChannelNotificationHandle

export interface ChannelNotificationServiceOptions {
  createNotification: ChannelNotificationFactory
  getSettings: () => NotificationSettings
  isWindowFocused: () => boolean
  resolver: ChannelNotificationSourceResolver
  onActivate: (messageRef: MessageRef) => void
}

export class ChannelNotificationService {
  private readonly dedupeKeys = new Set<string>()
  private readonly handles = new Set<ChannelNotificationHandle>()
  private disposed = false

  constructor(private readonly options: ChannelNotificationServiceOptions) {}

  async handleEvent(event: ChannelEvent): Promise<void> {
    if (this.disposed || event.type !== 'message.received') return
    const settings = this.options.getSettings()
    if (!settings.enabled || this.options.isWindowFocused()) return

    const newestByChannel = new Map<string, Message>()
    for (const message of event.messages) {
      if (!isEligibleMessage(message)) continue
      const previous = newestByChannel.get(message.ref.channelRef)
      if (!previous || compareMessages(previous, message) < 0)
        newestByChannel.set(message.ref.channelRef, message)
    }

    const messages = [...newestByChannel.values()]
      .sort((left, right) => compareMessages(right, left))
      .slice(0, MAX_CHANNELS_PER_BATCH)
    await Promise.all(messages.map((message) => this.notify(message)))
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const handle of this.handles) {
      try {
        handle.close()
      } catch {
        // Best effort during process shutdown.
      }
    }
    this.handles.clear()
    this.dedupeKeys.clear()
  }

  private async notify(message: Message): Promise<void> {
    const key = messageRefKey(message.ref)
    if (this.dedupeKeys.has(key) || this.disposed) return
    this.rememberDedupeKey(key)

    let context: ChannelNotificationContext
    try {
      context = await this.options.resolver.resolveNotificationContext(message.ref.channelRef)
    } catch {
      return
    }
    if (
      this.disposed ||
      !this.options.getSettings().enabled ||
      this.options.isWindowFocused() ||
      context.muted
    )
      return

    const settings = this.options.getSettings()
    let handle: ChannelNotificationHandle | null = null
    try {
      handle = this.options.createNotification(
        createNotificationOptions(context, message, settings),
      )
      this.handles.add(handle)
      const activeHandle = handle
      let activated = false
      activeHandle.onClick(() => {
        if (activated || this.disposed) return
        activated = true
        this.options.onActivate(message.ref)
        this.handles.delete(activeHandle)
        try {
          activeHandle.close()
        } catch {
          // Closing a notification is best effort after activation.
        }
      })
      activeHandle.onClose(() => this.handles.delete(activeHandle))
      activeHandle.show()
    } catch {
      if (!handle) return
      this.handles.delete(handle)
      try {
        handle.close()
      } catch {
        // Notification construction failures are best effort.
      }
    }
  }

  private rememberDedupeKey(key: string): void {
    this.dedupeKeys.delete(key)
    this.dedupeKeys.add(key)
    while (this.dedupeKeys.size > MAX_DEDUPE_KEYS) {
      const oldest = this.dedupeKeys.values().next().value
      if (oldest === undefined) break
      this.dedupeKeys.delete(oldest)
    }
  }
}

function createNotificationOptions(
  context: ChannelNotificationContext,
  message: Message,
  settings: NotificationSettings,
): ChannelNotificationOptions {
  const title = sanitize(context.channelName, MAX_TITLE_LENGTH) || 'Tea'
  const sender = sanitize(message.sender.name, MAX_TITLE_LENGTH)
  const text = sanitize(message.text, MAX_BODY_LENGTH)
  const body =
    settings.preview === 'hidden'
      ? ''
      : settings.preview === 'sender'
        ? sender
        : sanitize([sender, text].filter(Boolean).join(': '), MAX_BODY_LENGTH)
  return { title, body, silent: !settings.sound }
}

function isEligibleMessage(message: Message): boolean {
  return (
    message.state === 'active' &&
    !message.sentByCurrentUser &&
    !message.sender.isCurrentUser &&
    Boolean(message.ref.channelRef.trim()) &&
    Boolean(message.ref.messageClientId.trim())
  )
}

function compareMessages(left: Message, right: Message): number {
  return (
    left.sentAt - right.sentAt || left.ref.messageClientId.localeCompare(right.ref.messageClientId)
  )
}

function messageRefKey(ref: MessageRef): string {
  return [ref.channelRef, ref.messageClientId, ref.messageServerId ?? ''].join('\u0001')
}

function sanitize(value: string, maximum: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum)
}
