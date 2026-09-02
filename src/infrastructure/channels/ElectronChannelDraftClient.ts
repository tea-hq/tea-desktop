import type {
  ChannelDraft,
  ChannelDraftClient,
  ChannelRef,
  SaveChannelDraftRequest,
} from '@/features/channels/contracts'
import { invoke } from '../electronBridge'

export class ElectronChannelDraftClient implements ChannelDraftClient {
  list(accountRef: string): Promise<ChannelDraft[]> {
    return invoke('list_im_channel_drafts', { accountRef })
  }

  save(request: SaveChannelDraftRequest): Promise<ChannelDraft> {
    return invoke('save_im_channel_draft', { request })
  }

  async remove(accountRef: string, channelRef: ChannelRef): Promise<void> {
    await invoke('remove_im_channel_draft', { accountRef, channelRef })
  }
}
