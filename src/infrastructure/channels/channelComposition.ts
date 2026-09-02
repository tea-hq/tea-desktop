import type {
  ChannelAttachmentPicker,
  ChannelDraftClient,
  ChannelMediaClient,
  ChannelTransport,
  ChannelVoicePlaybackClient,
} from '@/features/channels/contracts'
import { BrowserChannelVoicePlaybackClient } from './BrowserChannelVoicePlaybackClient'
import { MockChannelTransport } from './MockChannelTransport'
import { ElectronChannelTransport } from './ElectronChannelTransport'
import { hasElectronBridge } from '../electronBridge'
import { BrowserChannelAttachmentPicker } from './browserChannelAttachmentPicker'
import { ElectronChannelAttachmentPicker } from './electronChannelAttachmentPicker'
import { ElectronChannelDraftClient } from './ElectronChannelDraftClient'
import { ElectronChannelMediaClient } from './ElectronChannelMediaClient'
import { MemoryChannelDraftClient } from './MemoryChannelDraftClient'
import { MockChannelMediaClient } from './MockChannelMediaClient'

export interface ChannelEnvironment {
  transport: ChannelTransport
  attachmentPicker: ChannelAttachmentPicker
  draftClient: ChannelDraftClient
  voicePlaybackClient: ChannelVoicePlaybackClient
  mediaClient: ChannelMediaClient
  preview: boolean
}

export function createChannelEnvironment(): ChannelEnvironment {
  const voicePlaybackClient = new BrowserChannelVoicePlaybackClient()
  if (!hasElectronBridge()) {
    return {
      transport: new MockChannelTransport(),
      attachmentPicker: new BrowserChannelAttachmentPicker(),
      draftClient: new MemoryChannelDraftClient(),
      voicePlaybackClient,
      mediaClient: new MockChannelMediaClient(),
      preview: true,
    }
  }
  return {
    transport: new ElectronChannelTransport(),
    attachmentPicker: new ElectronChannelAttachmentPicker(),
    draftClient: new ElectronChannelDraftClient(),
    voicePlaybackClient,
    mediaClient: new ElectronChannelMediaClient(),
    preview: false,
  }
}
