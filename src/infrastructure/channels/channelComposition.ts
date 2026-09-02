import type { ChannelTransport } from '@/features/channels/contracts'
import type { ChannelAttachmentPicker } from '@/features/channels/contracts'
import { MockChannelTransport } from './MockChannelTransport'
import { ElectronChannelTransport } from './ElectronChannelTransport'
import { hasElectronBridge } from '../electronBridge'
import { BrowserChannelAttachmentPicker } from './browserChannelAttachmentPicker'
import { ElectronChannelAttachmentPicker } from './electronChannelAttachmentPicker'

export interface ChannelEnvironment {
  transport: ChannelTransport
  attachmentPicker: ChannelAttachmentPicker
  preview: boolean
}

export function createChannelEnvironment(): ChannelEnvironment {
  if (!hasElectronBridge()) {
    return {
      transport: new MockChannelTransport(),
      attachmentPicker: new BrowserChannelAttachmentPicker(),
      preview: true,
    }
  }
  return {
    transport: new ElectronChannelTransport(),
    attachmentPicker: new ElectronChannelAttachmentPicker(),
    preview: false,
  }
}
