import { invoke, listen, type UnlistenFn } from '../electronBridge'
import type { DesktopCommand } from '@/types/electronBridge'

import type {
  ChannelCapability,
  ChannelEventListener,
  ChannelPage,
  ChannelRef,
  ChannelSelfProfile,
  ChannelUserProfile,
  ChannelStatus,
  ChannelTransport,
  ChannelTransportDescriptor,
  ListChannelsRequest,
  LoadMessagesRequest,
  MessagePage,
  SendMessageRequest,
  SendMessageResult,
} from '@/features/channels/contracts'
import { ChannelTransportError } from '@/features/channels/contracts'

const descriptor: ChannelTransportDescriptor = {
  id: 'yunxin.web',
  displayName: 'Yunxin',
  protocolVersion: 1,
  capabilities: [
    'channel.list',
    'profile.self',
    'message.history',
    'message.send.text',
    'channel.read',
    'message.modify.events',
    'message.delete.events',
    'message.revoke.events',
    'message.pin.events',
    'message.receipt.events',
  ]
    .map((id) => ({ id: id as ChannelCapability['id'], available: true }))
    .concat([
      { id: 'message.quickComment', available: false, reason: 'notVerified' },
    ] as ChannelCapability[]),
}

export class ElectronChannelTransport implements ChannelTransport {
  private currentStatus: ChannelStatus = { phase: 'disconnected', retryable: false }
  private listeners = new Set<ChannelEventListener>()
  private unlisten: Promise<UnlistenFn> | null = null
  private disposed = false

  descriptor(): ChannelTransportDescriptor {
    return structuredClone(descriptor)
  }
  capabilities(): ChannelCapability[] {
    return structuredClone(descriptor.capabilities)
  }
  status(): ChannelStatus {
    return structuredClone(this.currentStatus)
  }

  async getSelfProfile(): Promise<ChannelSelfProfile> {
    this.assertUsable()
    return this.command('get_channel_self_profile', {})
  }

  async getUserProfiles(accountIds: string[]): Promise<ChannelUserProfile[]> {
    this.assertUsable()
    return this.command('get_channel_user_profiles', { accountIds })
  }

  async connect(): Promise<void> {
    this.assertUsable()
    this.ensureListening()
    try {
      const current = await invoke<ChannelStatus>('get_channel_status')
      this.currentStatus =
        current.phase === 'connected' ? current : await invoke<ChannelStatus>('reconnect_channel')
    } catch (error) {
      throw mapCommandError(error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.disposed) return
    try {
      await invoke('disconnect_channel')
      this.currentStatus = { phase: 'disconnected', retryable: false }
    } catch (error) {
      throw mapCommandError(error)
    }
  }

  async listChannels(request: ListChannelsRequest): Promise<ChannelPage> {
    return this.command('list_channels', { request })
  }

  async loadMessages(request: LoadMessagesRequest): Promise<MessagePage> {
    return this.command('load_channel_messages', { request })
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    return this.command('send_channel_message', { request })
  }

  async openDirectConversation(_accountId: string): Promise<ChannelRef> {
    return this.command('open_direct_conversation', { accountId: _accountId })
  }

  async markRead(channelRef: ChannelRef): Promise<void> {
    await this.command('mark_channel_read', { channelRef })
  }

  subscribe(listener: ChannelEventListener): () => void {
    this.assertUsable()
    this.listeners.add(listener)
    this.ensureListening()
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    const unlisten = this.unlisten
    this.unlisten = null
    if (unlisten) (await unlisten)()
    this.currentStatus = { phase: 'disconnected', retryable: false }
  }

  private async command<T>(name: DesktopCommand, args: Record<string, unknown>): Promise<T> {
    this.assertUsable()
    try {
      return await invoke<T>(name, args)
    } catch (error) {
      throw mapCommandError(error)
    }
  }

  private ensureListening(): void {
    if (this.unlisten) return
    this.unlisten = listen('channel-event', (event) => {
      if (this.disposed) return
      if (event.payload.type === 'status.changed') this.currentStatus = event.payload.status
      for (const listener of [...this.listeners]) listener(structuredClone(event.payload))
    }).catch(() => () => undefined)
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelTransportError('disposed', false)
  }
}

function mapCommandError(value: unknown): ChannelTransportError {
  const candidate = value as { code?: unknown; retryable?: unknown } | null
  const code =
    candidate && typeof candidate.code === 'string' ? candidate.code : 'transportUnavailable'
  const retryable = candidate?.retryable === true
  switch (code) {
    case 'invalidRequest':
      return new ChannelTransportError('invalidRequest', false)
    case 'notInitialized':
      return new ChannelTransportError('notInitialized', false)
    case 'notConnected':
      return new ChannelTransportError('notConnected', true)
    case 'authenticationFailed':
      return new ChannelTransportError('authentication', false)
    case 'protocolFailure':
      return new ChannelTransportError('protocolFailure', false)
    case 'timeout':
      return new ChannelTransportError('timeout', true)
    default:
      return new ChannelTransportError('transport', retryable)
  }
}
