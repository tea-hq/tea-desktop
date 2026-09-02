import type { ElectronChannelDraftService } from '../services/channelDrafts'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import { readRecord, readString } from './commandValidation'

export interface ChannelDraftCommandServices {
  channelDrafts: ElectronChannelDraftService
}

export function createChannelDraftCommandHandlers(
  services: ChannelDraftCommandServices,
): DesktopCommandHandlerGroup {
  return defineCommandHandlers('channel-drafts', {
    list_im_channel_drafts: (args) =>
      services.channelDrafts.list(readString(args.accountRef, 'accountRef')),
    save_im_channel_draft: (args) => services.channelDrafts.save(readRecord(args.request)),
    remove_im_channel_draft: (args) =>
      services.channelDrafts.remove(
        readString(args.accountRef, 'accountRef'),
        readString(args.channelRef, 'channelRef'),
      ),
  } satisfies Partial<DesktopCommandHandlers>)
}
