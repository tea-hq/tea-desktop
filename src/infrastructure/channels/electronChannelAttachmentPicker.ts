import { invoke } from '../electronBridge'
import type { ChannelAttachment, ChannelAttachmentPicker } from '@/features/channels/contracts'

export class ElectronChannelAttachmentPicker implements ChannelAttachmentPicker {
  async pick(): Promise<ChannelAttachment[]> {
    return invoke<ChannelAttachment[]>('select_channel_attachments')
  }
}
