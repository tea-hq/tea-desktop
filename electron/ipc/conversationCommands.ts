import type { ElectronConversationService } from '../services/conversation'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import {
  readApprovalDecision,
  readInteger,
  readPermissionMode,
  readRecord,
  readString,
} from './commandValidation'

export interface ConversationCommandServices {
  conversation: ElectronConversationService
}

export function createConversationCommandHandlers(
  services: ConversationCommandServices,
): DesktopCommandHandlerGroup {
  const conversation = services.conversation

  return defineCommandHandlers('conversation', {
    list_conversation_runtimes: () => conversation.listRuntimes(),
    list_conversations: (args) => conversation.listConversations(readRecord(args.request) as never),
    get_conversation: (args) =>
      conversation.getConversation(readString(args.conversationId, 'conversationId')),
    load_conversation_history: (args) =>
      conversation.loadHistory(readRecord(args.request) as never),
    create_conversation: (args) =>
      conversation.createConversation(
        readString(args.runtimeId, 'runtimeId'),
        readString(args.idempotencyKey, 'idempotencyKey'),
        args.channelBinding as never,
        Array.isArray(args.hostTools) ? (args.hostTools as never) : [],
      ),
    configure_conversation_host_tools: (args) =>
      conversation.configureHostTools(
        readString(args.conversationId, 'conversationId'),
        Array.isArray(args.hostTools) ? (args.hostTools as never) : [],
      ),
    append_conversation_sources: (args) =>
      conversation.appendSources(
        readString(args.conversationId, 'conversationId'),
        readInteger(args.turnIndex, 'turnIndex'),
        Array.isArray(args.sources) ? (args.sources as never) : [],
      ),
    create_channel_draft: (args) =>
      conversation.createDraft(
        readString(args.conversationId, 'conversationId'),
        readInteger(args.sourceTurnIndex, 'sourceTurnIndex'),
        readString(args.sourceBlockId, 'sourceBlockId'),
        readString(args.content, 'content'),
      ),
    update_channel_draft: (args) =>
      conversation.updateDraft(
        readString(args.draftId, 'draftId'),
        readString(args.content, 'content'),
      ),
    prepare_draft_delivery: (args) =>
      conversation.prepareDelivery(readString(args.draftId, 'draftId')),
    mark_draft_delivery_sending: (args) =>
      conversation.updateDelivery(readString(args.deliveryId, 'deliveryId'), 'sending'),
    complete_draft_delivery: (args) =>
      conversation.updateDelivery(
        readString(args.deliveryId, 'deliveryId'),
        'sent',
        args.sentMessageRef as never,
      ),
    fail_draft_delivery: (args) =>
      conversation.updateDelivery(
        readString(args.deliveryId, 'deliveryId'),
        'failed',
        undefined,
        readString(args.failureCode, 'failureCode'),
      ),
    send_message: (args) =>
      conversation.send(
        readString(args.conversationId, 'conversationId'),
        readString(args.text, 'text'),
        {
          model: args.model === null ? 'default' : readString(args.model, 'model'),
          permissionMode: readPermissionMode(args.permissionMode),
        },
        Array.isArray(args.sources) ? (args.sources as never) : [],
      ),
    cancel_conversation: (args) =>
      conversation.cancel(readString(args.conversationId, 'conversationId')),
    respond_to_approval: (args) =>
      conversation.respondToApproval(
        readString(args.conversationId, 'conversationId'),
        readString(args.approvalId, 'approvalId'),
        readApprovalDecision(args.decision),
      ),
    resolve_host_tool_call: (args) => conversation.resolveHostToolCall(args.result as never),
    rename_conversation: (args) =>
      conversation.rename(
        readString(args.conversationId, 'conversationId'),
        readString(args.title, 'title'),
      ),
    archive_conversation: (args) =>
      conversation.archive(readString(args.conversationId, 'conversationId')),
    delete_conversation: (args) =>
      conversation.remove(readString(args.conversationId, 'conversationId')),
  } satisfies Partial<DesktopCommandHandlers>)
}
