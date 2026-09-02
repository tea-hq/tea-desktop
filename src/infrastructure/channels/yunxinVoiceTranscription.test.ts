import { describe, expect, it } from 'vitest'

import { ChannelTransportError } from '@/features/channels/contracts'
import {
  mapYunxinVoiceToTextParams,
  normalizeYunxinVoiceTranscript,
} from './yunxinVoiceTranscription'

describe('Yunxin voice transcription mapping', () => {
  it('maps a bounded voice attachment to exact SDK parameters', () => {
    expect(
      mapYunxinVoiceToTextParams({
        messageType: 2,
        attachment: {
          url: 'https://cdn.example.test/voice.aac',
          duration: 2_400,
          sceneName: 'nim_voice',
        },
      }),
    ).toEqual({
      voiceUrl: 'https://cdn.example.test/voice.aac',
      duration: 2_400,
      mimeType: 'aac',
      sampleRate: '16000',
      sceneName: 'nim_voice',
    })
  })

  it('rejects non-voice messages, unsafe URLs, and invalid durations', () => {
    expect(() =>
      mapYunxinVoiceToTextParams({
        messageType: 0,
        attachment: { url: 'https://cdn.example.test/voice.aac', duration: 1 },
      }),
    ).toThrow(ChannelTransportError)
    expect(() =>
      mapYunxinVoiceToTextParams({
        messageType: 2,
        attachment: { url: 'http://cdn.example.test/voice.aac', duration: 1 },
      }),
    ).toThrow(ChannelTransportError)
    expect(() =>
      mapYunxinVoiceToTextParams({
        messageType: 2,
        attachment: { url: 'https://cdn.example.test/voice.aac', duration: 0 },
      }),
    ).toThrow(ChannelTransportError)
  })

  it('accepts bounded text and fails closed for empty or unbounded provider output', () => {
    expect(normalizeYunxinVoiceTranscript('  Review the release plan.  ')).toBe(
      'Review the release plan.',
    )
    expect(() => normalizeYunxinVoiceTranscript(' ')).toThrow(ChannelTransportError)
    expect(() => normalizeYunxinVoiceTranscript('x'.repeat(32_769))).toThrow(ChannelTransportError)
    expect(() => normalizeYunxinVoiceTranscript(null)).toThrow(ChannelTransportError)
  })
})
