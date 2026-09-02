import type {
  ChannelAttachmentPicker,
  ChannelDraftClient,
  ChannelMediaClient,
  ChannelNotificationActivationClient,
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
import {
  ElectronChannelNotificationClient,
  NoopChannelNotificationClient,
} from './ElectronChannelNotificationClient'

export interface ChannelEnvironment {
  transport: ChannelTransport
  attachmentPicker: ChannelAttachmentPicker
  draftClient: ChannelDraftClient
  voicePlaybackClient: ChannelVoicePlaybackClient
  mediaClient: ChannelMediaClient
  notificationActivationClient: ChannelNotificationActivationClient
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
      notificationActivationClient: new NoopChannelNotificationClient(),
      preview: true,
    }
  }
  return {
    transport: new ElectronChannelTransport(),
    attachmentPicker: new ElectronChannelAttachmentPicker(),
    draftClient: new ElectronChannelDraftClient(),
    voicePlaybackClient,
    mediaClient: new ElectronChannelMediaClient(),
    notificationActivationClient: new ElectronChannelNotificationClient(),
    preview: false,
  }
}
