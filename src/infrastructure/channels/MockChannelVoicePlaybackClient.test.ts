import { describe, expect, it } from 'vitest'

import type { ChannelVoicePlaybackEvent } from '@/features/channels/contracts'
import { MockChannelVoicePlaybackClient } from './MockChannelVoicePlaybackClient'

describe('MockChannelVoicePlaybackClient', () => {
  it('records cloned requests and emits deterministic playback events', async () => {
    const client = new MockChannelVoicePlaybackClient()
    const events: ChannelVoicePlaybackEvent[] = []
    const request = {
      messageRef: { channelRef: 'product', messageClientId: 'voice-1' },
      sourceUrl: 'https://media.example.test/voice.aac',
      durationMs: 10_000,
      startAtMs: 0,
      playbackRate: 1 as const,
    }

    await client.play(request, (event) => events.push(event))
    request.messageRef.messageClientId = 'mutated'
    client.emit({ type: 'playing' })
    client.seek(4_000)
    client.setPlaybackRate(1.5)
    client.pause()

    expect(client.requests[0]?.messageRef.messageClientId).toBe('voice-1')
    expect(client.seekRequests).toEqual([4_000])
    expect(client.rateRequests).toEqual([1.5])
    expect(client.pauseCount).toBe(1)
    expect(events).toEqual([{ type: 'playing' }])

    client.stop()
    client.dispose()
    client.dispose()
    expect(client.stopCount).toBe(1)
  })
})
