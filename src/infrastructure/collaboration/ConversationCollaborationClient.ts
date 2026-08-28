import {
  ChannelTransportError,
  type ChannelTransport,
  type JsonValue,
  type Message,
} from '@/features/channels/contracts'
import type { ConversationClient, HostToolDefinition } from '@/features/conversation/contracts'
import type { ChannelSource, Delivery, Draft, MessageRef } from '@/types/channelCollaboration'
import {
  channelHistoryToolDefinition,
  ChannelHistoryToolScope,
} from '@/infrastructure/channels/channelHistoryTool'

export class ConversationCollaborationClient {
  constructor(
    private readonly conversations: ConversationClient,
    private readonly transport: ChannelTransport,
  ) {}

  async attachTurnHistory(
    conversationId: string,
    channelRef: string,
    turnIndex: number,
    knownRefs: MessageRef[],
    onSources: (sources: ChannelSource[]) => void,
  ): Promise<() => void> {
    if (!this.hasCapability('message.history')) return () => undefined
    const scope = new ChannelHistoryToolScope(this.transport, channelRef, knownRefs)
    const handled = new Set<string>()
    return this.conversations.subscribeToHostToolCalls(conversationId, (call) => {
      if (handled.has(call.callId)) return
      handled.add(call.callId)
      void (async () => {
        const outcome = await scope.execute(call)
        if (outcome.loadedSources.length > 0) {
          const persisted = await this.conversations.appendConversationSources(
            conversationId,
            turnIndex,
            outcome.loadedSources,
          )
          onSources(persisted)
        }
        await this.conversations.resolveHostToolCall(outcome.result)
      })().catch(async () => {
        await this.conversations
          .resolveHostToolCall({
            conversationId,
            callId: call.callId,
            status: 'failure',
            code: 'executionFailed',
          })
          .catch(() => undefined)
      })
    })
  }

  creationHostTools(): HostToolDefinition[] {
    return this.hasCapability('message.history')
      ? [structuredClone(channelHistoryToolDefinition)]
      : []
  }

  async deliverDraft(draft: Draft, runtimeName: string): Promise<Delivery> {
    if (!this.hasCapability('message.send.text')) throw new Error('channelCapabilityUnavailable')
    let delivery = await this.conversations.prepareDelivery(draft.draftId)
    if (delivery.status === 'sent') return delivery
    this.assertCurrentBinding(delivery)

    if (delivery.status === 'sending' || delivery.status === 'failed') {
      const sentRef = await this.findDeliveredMessage(delivery)
      if (sentRef) return this.conversations.completeDelivery(delivery.deliveryId, sentRef)
      if (delivery.status === 'sending') {
        return this.conversations.failDelivery(delivery.deliveryId, 'deliveryUncertain')
      }
    }

    delivery = await this.conversations.markDeliverySending(delivery.deliveryId)
    try {
      const result = await this.transport.sendMessage({
        channelRef: delivery.channelBinding.channelRef,
        text: draft.content,
        idempotencyKey: delivery.idempotencyKey,
        serverExtension: {
          version: 1,
          identity: { kind: 'agent', name: runtimeName },
          conversationId: draft.conversationId,
          draftId: draft.draftId,
          draftVersion: draft.currentVersion,
          deliveryId: delivery.deliveryId,
          idempotencyKey: delivery.idempotencyKey,
        },
      })
      return await this.conversations.completeDelivery(delivery.deliveryId, result.ref)
    } catch (error) {
      await this.conversations
        .failDelivery(delivery.deliveryId, deliveryFailureCode(error))
        .catch(() => undefined)
      throw error
    }
  }

  private assertCurrentBinding(delivery: Delivery): void {
    const status = this.transport.status()
    if (
      status.phase !== 'connected' ||
      status.accountRef !== delivery.channelBinding.accountRef ||
      this.transport.descriptor().id !== delivery.channelBinding.transportId
    ) {
      throw new Error('channelBindingUnavailable')
    }
  }

  private hasCapability(id: 'message.history' | 'message.send.text'): boolean {
    return this.transport
      .capabilities()
      .some((capability) => capability.id === id && capability.available)
  }

  private async findDeliveredMessage(delivery: Delivery): Promise<MessageRef | null> {
    const page = await this.transport.loadMessages({
      channelRef: delivery.channelBinding.channelRef,
      direction: 'before',
      limit: 50,
    })
    return (
      page.items.find((message) => extensionIdempotencyKey(message) === delivery.idempotencyKey)
        ?.ref ?? null
    )
  }
}

function deliveryFailureCode(error: unknown): string {
  if (error instanceof ChannelTransportError) return error.code
  if (
    error instanceof Error &&
    (error.message === 'serverExtensionTooLarge' || error.message === 'serverExtensionTooDeep')
  ) {
    return error.message
  }
  return 'deliveryUncertain'
}

function extensionIdempotencyKey(message: Message): string | null {
  const extension = message.serverExtension
  if (!isJsonObject(extension)) return null
  return typeof extension.idempotencyKey === 'string' ? extension.idempotencyKey : null
}

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
