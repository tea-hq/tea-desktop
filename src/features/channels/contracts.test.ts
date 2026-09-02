import { describe, expect, it } from 'vitest'

import type {
  ChannelAttachmentPicker,
  ChannelCapability,
  ChannelDraft,
  ChannelDraftClient,
  ChannelEvent,
  ChannelPresence,
  ChannelTransport,
  ChannelVoicePlaybackClient,
  ChannelVoicePlaybackEvent,
  ChannelVoicePlaybackRequest,
  ChannelVoicePlaybackState,
  ChannelVoiceTranscript,
  OutgoingMessageAttempt,
  SaveChannelDraftRequest,
} from './contracts'

describe('channel draft contracts', () => {
  it('keep human IM drafts provider-neutral and account scoped', async () => {
    const saved: ChannelDraft = {
      accountRef: 'account-ref',
      channelRef: 'channel-ref',
      text: '@Lin review this',
      mentions: [
        {
          target: { kind: 'user', accountId: 'lin' },
          label: '@Lin',
          ranges: [{ start: 0, end: 4 }],
        },
      ],
      updatedAt: 1,
    }
    const client: ChannelDraftClient = {
      list: async () => [saved],
      save: async (_request: SaveChannelDraftRequest) => saved,
      remove: async () => undefined,
    }

    await expect(client.list('account-ref')).resolves.toEqual([saved])
    expect(saved).not.toHaveProperty('attachments')
    expect(saved).not.toHaveProperty('provider')
  })
})

describe('outgoing message contracts', () => {
  it('keep delivery attempts and attachment ownership provider-neutral', async () => {
    const attempt: OutgoingMessageAttempt = {
      attemptId: 'attempt-1',
      idempotencyKey: 'im-send:v1:one',
      operationId: 'operation-1',
      channelRef: 'channel-ref',
      content: { kind: 'text', text: 'Review this' },
      mentions: [],
      createdAt: 1,
      status: 'failed',
      progress: 0,
      attemptNumber: 1,
      retryable: true,
      errorCode: 'transport',
    }
    const picker: ChannelAttachmentPicker = {
      pick: async () => [],
      release: async () => undefined,
    }

    expect(attempt).not.toHaveProperty('provider')
    expect(attempt).not.toHaveProperty('sendingState')
    await expect(picker.release('opaque-token')).resolves.toBeUndefined()
  })
})

describe('contact presence contracts', () => {
  it('keep transient presence and replace-set subscription provider-neutral', async () => {
    const presence: ChannelPresence = {
      accountId: 'lin',
      availability: 'online',
      updatedAt: 1,
    }
    const capability: ChannelCapability = { id: 'presence.subscribe', available: true }
    const event: ChannelEvent = {
      type: 'presence.changed',
      sequence: 1,
      occurredAt: 1,
      presences: [presence],
    }
    const transport: Pick<ChannelTransport, 'setPresenceSubscriptions'> = {
      setPresenceSubscriptions: async () => undefined,
    }

    expect(capability.id).toBe('presence.subscribe')
    expect(event.presences).toEqual([presence])
    expect(presence).not.toHaveProperty('statusType')
    expect(presence).not.toHaveProperty('serverExtension')
    await expect(transport.setPresenceSubscriptions(['lin'])).resolves.toBeUndefined()
  })
})

describe('voice transcription contracts', () => {
  it('keep voice transcription provider-neutral and message scoped', async () => {
    const messageRef = {
      channelRef: 'channel-ref',
      messageClientId: 'voice-client-id',
      messageServerId: 'voice-server-id',
    }
    const transcript: ChannelVoiceTranscript = {
      messageRef,
      status: 'ready',
      text: 'Review the release plan.',
      retryable: false,
    }
    const capability: ChannelCapability = {
      id: 'message.voice.transcribe',
      available: true,
    }
    const transport: Pick<ChannelTransport, 'transcribeVoice'> = {
      transcribeVoice: async () => transcript.text!,
    }

    expect(capability.id).toBe('message.voice.transcribe')
    expect(transcript).not.toHaveProperty('voiceUrl')
    expect(transcript).not.toHaveProperty('mimeType')
    await expect(transport.transcribeVoice(messageRef)).resolves.toBe(transcript.text)
  })
})

describe('voice playback contracts', () => {
  it('keep media playback provider-neutral and renderer scoped', async () => {
    const request: ChannelVoicePlaybackRequest = {
      messageRef: {
        channelRef: 'channel-ref',
        messageClientId: 'voice-client-id',
        messageServerId: 'voice-server-id',
      },
      sourceUrl: 'https://media.example.test/voice.aac',
      durationMs: 12_000,
      startAtMs: 2_000,
      playbackRate: 1.5,
    }
    const state: ChannelVoicePlaybackState = {
      messageRef: request.messageRef,
      status: 'playing',
      positionMs: 2_000,
      durationMs: 12_000,
      playbackRate: 1.5,
      retryable: false,
    }
    const events: ChannelVoicePlaybackEvent[] = []
    const client: ChannelVoicePlaybackClient = {
      play: async (_request, listener) => {
        listener({ type: 'playing' })
      },
      pause: () => undefined,
      seek: () => undefined,
      setPlaybackRate: () => undefined,
      stop: () => undefined,
      dispose: () => undefined,
    }

    await expect(client.play(request, (event) => events.push(event))).resolves.toBeUndefined()
    expect(events).toEqual([{ type: 'playing' }])
    expect(state).not.toHaveProperty('sourceUrl')
    expect(state).not.toHaveProperty('provider')
  })
})
