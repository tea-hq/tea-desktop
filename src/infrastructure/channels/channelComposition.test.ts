// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'

import { BrowserChannelVoicePlaybackClient } from './BrowserChannelVoicePlaybackClient'
import { ElectronChannelMediaClient } from './ElectronChannelMediaClient'
import { ElectronChannelTransport } from './ElectronChannelTransport'
import { MockChannelMediaClient } from './MockChannelMediaClient'
import {
  ElectronChannelNotificationClient,
  NoopChannelNotificationClient,
} from './ElectronChannelNotificationClient'
import { MockChannelTransport } from './MockChannelTransport'
import { createChannelEnvironment } from './channelComposition'

afterEach(() => {
  Reflect.deleteProperty(window, 'teaDesktop')
})

describe('channel composition', () => {
  it('provides one provider-neutral browser player in preview mode', () => {
    const environment = createChannelEnvironment()

    expect(environment.preview).toBe(true)
    expect(environment.transport).toBeInstanceOf(MockChannelTransport)
    expect(environment.voicePlaybackClient).toBeInstanceOf(BrowserChannelVoicePlaybackClient)
    expect(environment.mediaClient).toBeInstanceOf(MockChannelMediaClient)
    expect(environment.notificationActivationClient).toBeInstanceOf(NoopChannelNotificationClient)

    environment.voicePlaybackClient.dispose()
    void environment.mediaClient.dispose()
    void environment.notificationActivationClient.dispose()
  })

  it('provides the same player boundary in the Electron renderer', () => {
    Object.defineProperty(window, 'teaDesktop', {
      configurable: true,
      value: {},
    })

    const environment = createChannelEnvironment()

    expect(environment.preview).toBe(false)
    expect(environment.transport).toBeInstanceOf(ElectronChannelTransport)
    expect(environment.voicePlaybackClient).toBeInstanceOf(BrowserChannelVoicePlaybackClient)
    expect(environment.mediaClient).toBeInstanceOf(ElectronChannelMediaClient)
    expect(environment.notificationActivationClient).toBeInstanceOf(
      ElectronChannelNotificationClient,
    )

    environment.voicePlaybackClient.dispose()
    void environment.mediaClient.dispose()
    void environment.notificationActivationClient.dispose()
  })
})
