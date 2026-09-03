import type {
  ChannelEvent,
  ChannelPage,
  ChannelStatus,
  ChannelUserProfile,
  ChannelTransportDescriptor,
  ListChannelsRequest,
  LoadMessagesRequest,
  MessagePage,
  SendMessageRequest,
  SendMessageResult,
} from '../../src/features/channels/contracts'
import {
  YunxinWebChannelTransport,
  type YunxinSdkFactory,
} from '../../src/infrastructure/channels/YunxinWebChannelTransport'
import type { ManagedImCredentials } from './managedWorkspace'
import { createNodeYunxinSdkFactory } from './yunxinNode'

export type ChannelEventEmitter = (event: ChannelEvent) => void

export class ElectronChannelService {
  private readonly transport: YunxinWebChannelTransport

  constructor(
    getCredentials: () => Promise<ManagedImCredentials>,
    private readonly emitEvent: ChannelEventEmitter,
    factory: YunxinSdkFactory = createNodeYunxinSdkFactory(),
  ) {
    this.transport = new YunxinWebChannelTransport({ load: getCredentials }, factory)
    this.transport.subscribe((event) => this.emitEvent(event))
  }

  descriptor(): ChannelTransportDescriptor {
    return this.transport.descriptor()
  }

  status(): ChannelStatus {
    return this.transport.status()
  }

  async connect(): Promise<ChannelStatus> {
    await this.transport.connect()
    return this.status()
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect()
  }

  async listChannels(request: ListChannelsRequest): Promise<ChannelPage> {
    return this.transport.listChannels(request)
  }

  async loadMessages(request: LoadMessagesRequest): Promise<MessagePage> {
    return this.transport.loadMessages(request)
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    return this.transport.sendMessage(request)
  }

  async markRead(channelRef: string): Promise<void> {
    await this.transport.markRead(channelRef)
  }

  async openDirectConversation(accountId: string): Promise<string> {
    return this.transport.openDirectConversation(accountId)
  }

  async selfProfile() {
    return this.transport.getSelfProfile()
  }

  async userProfiles(accountIds: string[]): Promise<ChannelUserProfile[]> {
    return this.transport.getUserProfiles(accountIds)
  }

  async dispose(): Promise<void> {
    await this.transport.dispose()
  }
}
