import type {
  HostToolResult,
  ListConversationsRequest,
  LoadConversationHistoryRequest,
} from '../../src/features/conversation/contracts'
import type {
  ChannelBinding,
  ChannelSourceInput,
  MessageRef,
} from '../../src/types/channelCollaboration'
import type { ConversationCommandService } from '../conversation/commandService'
import type { RuntimeHostToolReference } from '../conversation/service'
import type { RunnerRegistrationCommandInput } from '../../packages/runner/src/protocol'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import {
  readApprovalDecision,
  readArray,
  readInteger,
  readPermissionMode,
  readRecord,
  readString,
} from './commandValidation'

export interface ConversationCommandServices {
  conversation: ConversationCommandService
}

export function createConversationCommandHandlers(
  services: ConversationCommandServices,
): DesktopCommandHandlerGroup {
  const conversation = services.conversation

  return defineCommandHandlers('conversation', {
    list_conversation_runtimes: () => conversation.listRuntimes(),
    list_cloud_runner_tags: () => conversation.listRunnerTags?.() ?? [],
    list_cloud_runner_tokens: () => conversation.listRunnerTokens?.() ?? [],
    reset_personal_runner_token: () =>
      conversation.resetPersonalRunnerToken?.() ??
      Promise.reject({ code: 'unavailable', retryable: true }),
    create_cloud_runner_registration_command: (args) =>
      conversation.createRunnerRegistrationCommand?.(readRunnerRegistrationCommandInput(args)) ??
      Promise.reject({ code: 'unavailable', retryable: true }),
    list_conversations: (args) =>
      conversation.listConversations(
        readRecord(args.request) as unknown as ListConversationsRequest,
      ),
    get_conversation: (args) =>
      conversation.getConversation(readString(args.conversationId, 'conversationId')),
    load_conversation_history: (args) =>
      conversation.loadConversationHistory(
        readRecord(args.request) as unknown as LoadConversationHistoryRequest,
      ),
    create_conversation: (args) =>
      conversation.createConversation({
        runtimeId: readString(args.runtimeId, 'runtimeId'),
        idempotencyKey: readString(args.idempotencyKey, 'idempotencyKey'),
        model: args.model === undefined ? undefined : readString(args.model, 'model'),
        workingDirectory:
          args.workingDirectory === undefined
            ? undefined
            : readString(args.workingDirectory, 'workingDirectory'),
        channelBinding:
          args.channelBinding === undefined
            ? undefined
            : (readRecord(args.channelBinding) as unknown as ChannelBinding),
        hostTools: readArray(args.hostTools, 'hostTools').map((value) =>
          readHostToolReference(value),
        ),
        executionTarget:
          args.executionTarget === undefined
            ? undefined
            : readExecutionTarget(args.executionTarget),
        providerId:
          args.providerId === undefined ? undefined : readString(args.providerId, 'providerId'),
        modelId: args.modelId === undefined ? undefined : readString(args.modelId, 'modelId'),
        runnerTags:
          args.runnerTags === undefined
            ? undefined
            : readArray(args.runnerTags, 'runnerTags').map((value) =>
                readString(value, 'runnerTag'),
              ),
        permissionMode:
          args.permissionMode === undefined ? undefined : readPermissionMode(args.permissionMode),
      }),
    relocate_conversation_workspace: (args) =>
      conversation.relocateConversationWorkspace(
        readString(args.conversationId, 'conversationId'),
        readString(args.workspacePath, 'workspacePath'),
      ),
    append_conversation_sources: (args) =>
      conversation.appendConversationSources(
        readString(args.conversationId, 'conversationId'),
        readInteger(args.turnIndex, 'turnIndex'),
        readArray(args.sources, 'sources').map(
          (value) => readRecord(value) as unknown as ChannelSourceInput,
        ),
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
        readRecord(args.sentMessageRef) as unknown as MessageRef,
      ),
    fail_draft_delivery: (args) =>
      conversation.updateDelivery(
        readString(args.deliveryId, 'deliveryId'),
        'failed',
        undefined,
        readString(args.failureCode, 'failureCode'),
      ),
    send_message: (args) =>
      conversation.sendMessage(
        readString(args.conversationId, 'conversationId'),
        readString(args.text, 'text'),
        {
          model: args.model === null ? 'default' : readString(args.model, 'model'),
          permissionMode: readPermissionMode(args.permissionMode),
          ...(args.sources === undefined
            ? {}
            : {
                sources: readArray(args.sources, 'sources').map(
                  (value) => readRecord(value) as unknown as ChannelSourceInput,
                ),
              }),
        },
      ),
    cancel_conversation: (args) =>
      conversation.cancel(readString(args.conversationId, 'conversationId')),
    respond_to_approval: (args) =>
      conversation.respondToApproval(
        readString(args.conversationId, 'conversationId'),
        readString(args.approvalId, 'approvalId'),
        readApprovalDecision(args.decision),
      ),
    resolve_host_tool_call: (args) =>
      conversation.resolveHostToolCall(readRecord(args.result) as unknown as HostToolResult),
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

function readExecutionTarget(value: unknown): 'local' | 'cloud' {
  const target = readString(value, 'executionTarget')
  if (target !== 'local' && target !== 'cloud') throw { code: 'invalidRequest', retryable: false }
  return target
}

function readRunnerRegistrationCommandInput(
  args: Record<string, unknown>,
): RunnerRegistrationCommandInput {
  const input: RunnerRegistrationCommandInput = {}
  if (args.tokenId !== undefined) input.tokenId = readString(args.tokenId, 'tokenId')
  return input
}

function readHostToolReference(value: unknown): RuntimeHostToolReference {
  const record = readRecord(value)
  if (
    Object.keys(record).length !== 2 ||
    !Object.hasOwn(record, 'name') ||
    !Object.hasOwn(record, 'version')
  ) {
    throw { code: 'invalidRequest', retryable: false }
  }
  return {
    name: readString(record.name, 'hostTools.name'),
    version: readString(record.version, 'hostTools.version'),
  }
}
