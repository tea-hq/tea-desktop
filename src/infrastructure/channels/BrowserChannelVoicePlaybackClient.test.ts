// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'

import type {
  ChannelVoicePlaybackEvent,
  ChannelVoicePlaybackRequest,
} from '@/features/channels/contracts'
import {
  BrowserChannelVoicePlaybackClient,
  ChannelVoicePlaybackClientError,
} from './BrowserChannelVoicePlaybackClient'

class FakeAudioElement extends EventTarget {
  src = ''
  preload = ''
  currentTime = 0
  duration = 12
  playbackRate = 1
  paused = true
  error: { code: number } | null = null
  readonly listenerHistory = new Map<string, EventListener[]>()
  readonly play = vi.fn(async () => {
    this.paused = false
    this.dispatchEvent(new Event('play'))
  })
  readonly pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = ''
  })

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (typeof listener === 'function') {
      const values = this.listenerHistory.get(type) ?? []
      values.push(listener)
      this.listenerHistory.set(type, values)
    }
    super.addEventListener(type, listener)
  }
}

class FakeVisibilityTarget extends EventTarget {
  hidden = false
}

function request(messageClientId = 'voice-1'): ChannelVoicePlaybackRequest {
  return {
    messageRef: { channelRef: 'product', messageClientId },
    sourceUrl: `https://media.example.test/${messageClientId}.aac`,
    durationMs: 12_000,
    startAtMs: 2_000,
    playbackRate: 1.5,
  }
}

describe('BrowserChannelVoicePlaybackClient', () => {
  it('owns one element and projects play, pause, seek, rate, and progress events', async () => {
    const audio = new FakeAudioElement()
    const visibility = new FakeVisibilityTarget()
    const createAudio = vi.fn(() => audio as unknown as HTMLAudioElement)
    const client = new BrowserChannelVoicePlaybackClient({
      createAudio,
      visibility: visibility as unknown as Document,
    })
    const events: ChannelVoicePlaybackEvent[] = []

    await client.play(request(), (event) => events.push(event))
    expect(createAudio).toHaveBeenCalledTimes(1)
    expect(audio.src).toBe('https://media.example.test/voice-1.aac')
    expect(audio.preload).toBe('metadata')
    expect(audio.currentTime).toBe(2)
    expect(audio.playbackRate).toBe(1.5)
    expect(events).toContainEqual({ type: 'playing' })

    audio.currentTime = 4
    audio.dispatchEvent(new Event('timeupdate'))
    expect(events).toContainEqual({ type: 'progress', positionMs: 4_000, durationMs: 12_000 })

    client.seek(6_000)
    client.setPlaybackRate(2)
    client.pause()
    expect(audio.currentTime).toBe(6)
    expect(audio.playbackRate).toBe(2)
    expect(events).toContainEqual({ type: 'paused' })

    audio.paused = false
    visibility.hidden = true
    visibility.dispatchEvent(new Event('visibilitychange'))
    expect(audio.pause).toHaveBeenCalled()

    client.stop()
    expect(audio.src).toBe('')
    client.dispose()
    client.dispose()
  })

  it('maps stable errors and rejects events from a superseded source', async () => {
    const audio = new FakeAudioElement()
    const client = new BrowserChannelVoicePlaybackClient({
      createAudio: () => audio as unknown as HTMLAudioElement,
    })
    const firstEvents: ChannelVoicePlaybackEvent[] = []
    const secondEvents: ChannelVoicePlaybackEvent[] = []

    await client.play(request('voice-1'), (event) => firstEvents.push(event))
    const staleProgress = audio.listenerHistory.get('timeupdate')?.at(-1)
    await client.play(request('voice-2'), (event) => secondEvents.push(event))
    staleProgress?.(new Event('timeupdate'))
    expect(firstEvents.filter((event) => event.type === 'progress')).toEqual([])

    audio.error = { code: 2 }
    audio.dispatchEvent(new Event('error'))
    expect(secondEvents).toContainEqual({ type: 'failed', errorCode: 'network', retryable: true })

    audio.play.mockRejectedValueOnce(new DOMException('blocked detail', 'NotAllowedError'))
    await expect(client.play(request('voice-3'), () => undefined)).rejects.toEqual(
      expect.objectContaining<Partial<ChannelVoicePlaybackClientError>>({
        code: 'blocked',
        retryable: true,
      }),
    )
  })

  it('fails closed for an unsafe source before starting media', async () => {
    const audio = new FakeAudioElement()
    const client = new BrowserChannelVoicePlaybackClient({
      createAudio: () => audio as unknown as HTMLAudioElement,
    })

    await expect(
      client.play({ ...request(), sourceUrl: 'javascript:alert(1)' }, () => undefined),
    ).rejects.toMatchObject({ code: 'unsupported', retryable: false })
    expect(audio.play).not.toHaveBeenCalled()
  })
})
