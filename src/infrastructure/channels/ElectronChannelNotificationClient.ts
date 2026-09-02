import type {
  ChannelNotificationActivationClient,
  ChannelNotificationActivationListener,
  MessageRef,
} from '@/features/channels/contracts'
import { listen, type UnlistenFn } from '../electronBridge'

export class ElectronChannelNotificationClient implements ChannelNotificationActivationClient {
  private disposed = false
  private listener: ChannelNotificationActivationListener | null = null
  private readonly unlisten: Promise<UnlistenFn>

  constructor() {
    try {
      this.unlisten = listen('channel-notification-activated', ({ payload }) => {
        if (this.disposed) return
        const messageRef = parseMessageRef(payload)
        if (messageRef) this.listener?.(messageRef)
      }).catch(() => noop)
    } catch {
      this.unlisten = Promise.resolve(noop)
    }
  }

  subscribe(listener: ChannelNotificationActivationListener): () => void {
    if (this.disposed) return noop
    this.listener = listener
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.listener === listener) this.listener = null
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      await this.unlisten
      return
    }
    this.disposed = true
    this.listener = null
    const unlisten = await this.unlisten
    unlisten()
  }
}

export class NoopChannelNotificationClient implements ChannelNotificationActivationClient {
  subscribe(_listener: ChannelNotificationActivationListener): () => void {
    return noop
  }

  async dispose(): Promise<void> {
    // Preview environments have no desktop event source.
  }
}

function parseMessageRef(value: unknown): MessageRef | null {
  if (!isRecord(value)) return null
  const channelRef = readMessageRefPart(value.channelRef)
  const messageClientId = readMessageRefPart(value.messageClientId)
  if (!channelRef || !messageClientId) return null
  if (value.messageServerId !== undefined) {
    const messageServerId = readMessageRefPart(value.messageServerId)
    if (!messageServerId) return null
    return { channelRef, messageClientId, messageServerId }
  }
  return { channelRef, messageClientId }
}

function readMessageRefPart(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return null
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function noop(): void {
  // A stable disposer keeps callers independent from the event source.
}
