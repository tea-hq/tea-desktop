import { createCatalogCommandHandlers, type CatalogCommandServices } from './catalogCommands'
import { createChannelCommandHandlers, type ChannelCommandServices } from './channelCommands'
import { createCommandRouter, type DesktopCommandRouter } from './commandRouter'
import {
  createConversationCommandHandlers,
  type ConversationCommandServices,
} from './conversationCommands'
import {
  createWorkspaceCommandHandlers,
  type WorkspaceCommandOptions,
  type WorkspaceCommandServices,
} from './workspaceCommands'
import {
  createChannelDraftCommandHandlers,
  type ChannelDraftCommandServices,
} from './channelDraftCommands'

export interface DesktopCommandServices
  extends
    WorkspaceCommandServices,
    ConversationCommandServices,
    CatalogCommandServices,
    ChannelCommandServices,
    ChannelDraftCommandServices {}

export function createDesktopCommandRouter(
  services: DesktopCommandServices,
  options: WorkspaceCommandOptions = {},
): DesktopCommandRouter {
  return createCommandRouter([
    createWorkspaceCommandHandlers(services, options),
    createConversationCommandHandlers(services),
    createCatalogCommandHandlers(services),
    createChannelCommandHandlers(services),
    createChannelDraftCommandHandlers(services),
  ])
}
