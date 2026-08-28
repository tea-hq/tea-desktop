import type {
  ApprovalDecision,
  ConversationDetail,
  ConversationHistoryPage,
  ConversationPage,
  CreateConversationResponse,
  HostToolResult,
  ListConversationsRequest,
  LoadConversationHistoryRequest,
  RuntimeDescriptor,
  SendMessageOptions,
} from '../../src/features/conversation/contracts'
import type {
  ChannelBinding,
  ChannelSource,
  ChannelSourceInput,
  Delivery,
  Draft,
  MessageRef,
} from '../../src/types/channelCollaboration'
import type { RuntimeConversationService, RuntimeHostToolReference } from './service'

export interface CreateConversationCommand {
  runtimeId: string
  idempotencyKey: string
  channelBinding?: ChannelBinding
  hostTools: RuntimeHostToolReference[]
}

export interface ConversationCommandService {
  listRuntimes(): Promise<RuntimeDescriptor[]>
  listConversations(request: ListConversationsRequest): Promise<ConversationPage>
  getConversation(conversationId: string): Promise<ConversationDetail>
  loadConversationHistory(request: LoadConversationHistoryRequest): Promise<ConversationHistoryPage>
  createConversation(request: CreateConversationCommand): Promise<CreateConversationResponse>
  appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): Promise<ChannelSource[]>
  createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Promise<Draft>
  updateDraft(draftId: string, content: string): Promise<Draft>
  prepareDelivery(draftId: string): Promise<Delivery>
  updateDelivery(
    deliveryId: string,
    status: Delivery['status'],
    sentMessageRef?: MessageRef,
    failureCode?: string,
  ): Promise<Delivery>
  sendMessage(conversationId: string, text: string, options: SendMessageOptions): Promise<void>
  cancel(conversationId: string): Promise<void>
  respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void>
  resolveHostToolCall(result: HostToolResult): Promise<void>
  rename(conversationId: string, title: string): Promise<void>
  archive(conversationId: string): Promise<void>
  remove(conversationId: string): Promise<void>
}

export class RuntimeConversationCommandService implements ConversationCommandService {
  constructor(
    private readonly service: RuntimeConversationService,
    private readonly workspaceId: string,
  ) {}

  async listRuntimes(): Promise<RuntimeDescriptor[]> {
    return this.service.listRuntimes()
  }

  async listConversations(request: ListConversationsRequest): Promise<ConversationPage> {
    return this.service.listConversations(request)
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    return this.service.getConversation(conversationId)
  }

  async loadConversationHistory(
    request: LoadConversationHistoryRequest,
  ): Promise<ConversationHistoryPage> {
    return this.service.loadConversationHistory(request)
  }

  async createConversation(
    request: CreateConversationCommand,
  ): Promise<CreateConversationResponse> {
    const result = await this.service.createConversation({
      runtimeId: request.runtimeId,
      workspaceId: this.workspaceId,
      idempotencyKey: request.idempotencyKey,
      channelBinding: request.channelBinding,
      hostTools: request.hostTools,
    })
    return {
      handle: {
        conversationId: result.handle.conversationId,
        runtimeId: result.handle.runtimeId,
        nativeSessionId: result.handle.nativeSessionId,
      },
      summary: result.summary,
    }
  }

  async appendConversationSources(
    conversationId: string,
    turnIndex: number,
    sources: ChannelSourceInput[],
  ): Promise<ChannelSource[]> {
    return this.service.appendConversationSources(conversationId, turnIndex, sources)
  }

  async createDraft(
    conversationId: string,
    sourceTurnIndex: number,
    sourceBlockId: string,
    content: string,
  ): Promise<Draft> {
    return this.service.createDraft(conversationId, sourceTurnIndex, sourceBlockId, content)
  }

  async updateDraft(draftId: string, content: string): Promise<Draft> {
    return this.service.updateDraft(draftId, content)
  }

  async prepareDelivery(draftId: string): Promise<Delivery> {
    return this.service.prepareDelivery(draftId)
  }

  async updateDelivery(
    deliveryId: string,
    status: Delivery['status'],
    sentMessageRef?: MessageRef,
    failureCode?: string,
  ): Promise<Delivery> {
    return this.service.updateDelivery(deliveryId, status, sentMessageRef, failureCode)
  }

  async sendMessage(
    conversationId: string,
    text: string,
    options: SendMessageOptions,
  ): Promise<void> {
    return this.service.sendMessage(conversationId, text, options)
  }

  async cancel(conversationId: string): Promise<void> {
    return this.service.cancel(conversationId)
  }

  async respondToApproval(
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    return this.service.respondToApproval(conversationId, approvalId, decision)
  }

  async resolveHostToolCall(result: HostToolResult): Promise<void> {
    return this.service.resolveHostToolCall(result)
  }

  async rename(conversationId: string, title: string): Promise<void> {
    return this.service.rename(conversationId, title)
  }

  async archive(conversationId: string): Promise<void> {
    return this.service.archive(conversationId)
  }

  async remove(conversationId: string): Promise<void> {
    return this.service.remove(conversationId)
  }
}
