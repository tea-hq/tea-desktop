import {
  type ChannelVoicePlaybackClient,
  type ChannelVoicePlaybackEvent,
  type ChannelVoicePlaybackListener,
  type ChannelVoicePlaybackRate,
  type ChannelVoicePlaybackRequest,
} from '@/features/channels/contracts'

export class MockChannelVoicePlaybackClient implements ChannelVoicePlaybackClient {
  readonly requests: ChannelVoicePlaybackRequest[] = []
  readonly seekRequests: number[] = []
  readonly rateRequests: ChannelVoicePlaybackRate[] = []
  pauseCount = 0
  stopCount = 0
  private listener: ChannelVoicePlaybackListener | null = null
  private disposed = false

  async play(
    request: ChannelVoicePlaybackRequest,
    listener: ChannelVoicePlaybackListener,
  ): Promise<void> {
    if (this.disposed) throw new Error('disposed')
    this.requests.push(structuredClone(request))
    this.listener = listener
  }

  pause(): void {
    if (this.disposed) return
    this.pauseCount += 1
  }

  seek(positionMs: number): void {
    if (!this.disposed) this.seekRequests.push(positionMs)
  }

  setPlaybackRate(rate: ChannelVoicePlaybackRate): void {
    if (!this.disposed) this.rateRequests.push(rate)
  }

  stop(): void {
    if (this.disposed) return
    this.stopCount += 1
    this.listener = null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listener = null
  }

  emit(event: ChannelVoicePlaybackEvent): void {
    this.listener?.(structuredClone(event))
  }
}
