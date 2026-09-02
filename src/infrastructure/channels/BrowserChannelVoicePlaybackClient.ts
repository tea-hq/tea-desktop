import {
  CHANNEL_VOICE_PLAYBACK_RATES,
  ChannelVoicePlaybackClientError,
  type ChannelVoicePlaybackClient,
  type ChannelVoicePlaybackErrorCode,
  type ChannelVoicePlaybackListener,
  type ChannelVoicePlaybackRate,
  type ChannelVoicePlaybackRequest,
} from '@/features/channels/contracts'

export { ChannelVoicePlaybackClientError } from '@/features/channels/contracts'

interface BrowserChannelVoicePlaybackOptions {
  createAudio?: () => HTMLAudioElement
  visibility?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>
}

const MAX_SOURCE_LENGTH = 2_048
const MAX_DURATION_MS = 24 * 60 * 60 * 1_000

export class BrowserChannelVoicePlaybackClient implements ChannelVoicePlaybackClient {
  private readonly audio: HTMLAudioElement
  private readonly visibility?: BrowserChannelVoicePlaybackOptions['visibility']
  private generation = 0
  private disposed = false
  private request: ChannelVoicePlaybackRequest | null = null
  private removeMediaListeners: (() => void) | null = null

  constructor(options: BrowserChannelVoicePlaybackOptions = {}) {
    this.audio = options.createAudio?.() ?? new Audio()
    this.audio.preload = 'metadata'
    this.visibility = options.visibility ?? (typeof document === 'undefined' ? undefined : document)
    this.visibility?.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  async play(
    request: ChannelVoicePlaybackRequest,
    listener: ChannelVoicePlaybackListener,
  ): Promise<void> {
    this.assertUsable()
    const value = validateRequest(request)
    this.pauseCurrent()
    this.generation += 1
    const generation = this.generation
    this.detachMediaListeners()
    this.request = value
    this.attachMediaListeners(generation, listener)
    this.audio.preload = 'metadata'
    this.audio.src = value.sourceUrl
    this.audio.load()
    this.audio.playbackRate = value.playbackRate
    this.seekAudio(value.startAtMs)
    try {
      await this.audio.play()
    } catch (error) {
      const mapped = mapPlaybackError(error)
      if (generation === this.generation) {
        listener({ type: 'failed', errorCode: mapped.code, retryable: mapped.retryable })
      }
      throw mapped
    }
  }

  pause(): void {
    if (this.disposed) return
    this.audio.pause()
  }

  seek(positionMs: number): void {
    if (this.disposed || !this.request || !Number.isFinite(positionMs)) return
    this.seekAudio(positionMs)
  }

  setPlaybackRate(rate: ChannelVoicePlaybackRate): void {
    if (this.disposed || !CHANNEL_VOICE_PLAYBACK_RATES.includes(rate)) return
    this.audio.playbackRate = rate
    if (this.request) this.request = { ...this.request, playbackRate: rate }
  }

  stop(): void {
    if (this.disposed) return
    this.reset()
  }

  dispose(): void {
    if (this.disposed) return
    this.reset()
    this.disposed = true
    this.visibility?.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.visibility?.hidden) this.pause()
  }

  private attachMediaListeners(generation: number, listener: ChannelVoicePlaybackListener): void {
    const current = (callback: () => void) => () => {
      if (!this.disposed && generation === this.generation) callback()
    }
    const listeners: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [
      ['play', current(() => listener({ type: 'playing' }))],
      ['pause', current(() => listener({ type: 'paused' }))],
      ['ended', current(() => listener({ type: 'ended' }))],
      ['loadedmetadata', current(() => this.seekAudio(this.request?.startAtMs ?? 0))],
      [
        'timeupdate',
        current(() =>
          listener({
            type: 'progress',
            positionMs: boundedMilliseconds(this.audio.currentTime * 1_000),
            durationMs: this.durationMs(),
          }),
        ),
      ],
      [
        'error',
        current(() => {
          const mapped = mapMediaError(this.audio.error?.code)
          listener({ type: 'failed', errorCode: mapped.code, retryable: mapped.retryable })
        }),
      ],
    ]
    for (const [type, handler] of listeners) this.audio.addEventListener(type, handler)
    this.removeMediaListeners = () => {
      for (const [type, handler] of listeners) this.audio.removeEventListener(type, handler)
    }
  }

  private durationMs(): number {
    const mediaDuration = boundedMilliseconds(this.audio.duration * 1_000)
    return mediaDuration || this.request?.durationMs || 0
  }

  private seekAudio(positionMs: number): void {
    const durationMs = this.durationMs()
    try {
      this.audio.currentTime = clamp(positionMs, 0, durationMs) / 1_000
    } catch {
      // A fresh media element may reject seeking until metadata is available.
    }
  }

  private pauseCurrent(): void {
    if (!this.audio.paused) this.audio.pause()
  }

  private reset(): void {
    this.pauseCurrent()
    this.generation += 1
    this.detachMediaListeners()
    this.request = null
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  private detachMediaListeners(): void {
    this.removeMediaListeners?.()
    this.removeMediaListeners = null
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelVoicePlaybackClientError('unknown', false)
  }
}

function validateRequest(request: ChannelVoicePlaybackRequest): ChannelVoicePlaybackRequest {
  const sourceUrl = request.sourceUrl.trim()
  let protocol = ''
  try {
    protocol = new URL(sourceUrl).protocol
  } catch {
    throw new ChannelVoicePlaybackClientError('unsupported', false)
  }
  if (
    !sourceUrl ||
    sourceUrl.length > MAX_SOURCE_LENGTH ||
    (protocol !== 'https:' && protocol !== 'blob:') ||
    !CHANNEL_VOICE_PLAYBACK_RATES.includes(request.playbackRate)
  )
    throw new ChannelVoicePlaybackClientError('unsupported', false)
  const durationMs = optionalMilliseconds(request.durationMs)
  const startAtMs = clamp(boundedMilliseconds(request.startAtMs), 0, durationMs ?? MAX_DURATION_MS)
  return {
    messageRef: structuredClone(request.messageRef),
    sourceUrl,
    ...(durationMs === undefined ? {} : { durationMs }),
    startAtMs,
    playbackRate: request.playbackRate,
  }
}

function optionalMilliseconds(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return boundedMilliseconds(value)
}

function boundedMilliseconds(value: number): number {
  return Number.isFinite(value) ? clamp(Math.round(value), 0, MAX_DURATION_MS) : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function mapPlaybackError(error: unknown): ChannelVoicePlaybackClientError {
  if (error instanceof ChannelVoicePlaybackClientError) return error
  if (error instanceof DOMException && error.name === 'NotAllowedError')
    return new ChannelVoicePlaybackClientError('blocked', true)
  if (error instanceof DOMException && error.name === 'NotSupportedError')
    return new ChannelVoicePlaybackClientError('unsupported', false)
  return new ChannelVoicePlaybackClientError('unknown', true)
}

function mapMediaError(code: number | undefined): {
  code: ChannelVoicePlaybackErrorCode
  retryable: boolean
} {
  if (code === 2) return { code: 'network', retryable: true }
  if (code === 3) return { code: 'decode', retryable: false }
  if (code === 4) return { code: 'unsupported', retryable: false }
  return { code: 'unknown', retryable: true }
}
