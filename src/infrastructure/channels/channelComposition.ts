import type {
  ChannelAttachmentPicker,
  ChannelDraftClient,
  ChannelTransport,
} from '@/features/channels/contracts'
import { MockChannelTransport } from './MockChannelTransport'
import { ElectronChannelTransport } from './ElectronChannelTransport'
import { hasElectronBridge } from '../electronBridge'
import { BrowserChannelAttachmentPicker } from './browserChannelAttachmentPicker'
import { ElectronChannelAttachmentPicker } from './electronChannelAttachmentPicker'
import { ElectronChannelDraftClient } from './ElectronChannelDraftClient'
import { MemoryChannelDraftClient } from './MemoryChannelDraftClient'

export interface ChannelEnvironment {
  transport: ChannelTransport
  attachmentPicker: ChannelAttachmentPicker
  draftClient: ChannelDraftClient
  preview: boolean
}

export function createChannelEnvironment(): ChannelEnvironment {
  if (!hasElectronBridge()) {
    return {
      transport: new MockChannelTransport(),
      attachmentPicker: new BrowserChannelAttachmentPicker(),
      draftClient: new MemoryChannelDraftClient(),
      preview: true,
    }
  }
  return {
    transport: new ElectronChannelTransport(),
    attachmentPicker: new ElectronChannelAttachmentPicker(),
    draftClient: new ElectronChannelDraftClient(),
    preview: false,
  }
}
