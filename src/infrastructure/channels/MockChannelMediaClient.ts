import {
  ChannelMediaClientError,
  type ChannelMediaClient,
  type ChannelMediaSaveProgressEvent,
  type ChannelMediaSaveProgressListener,
  type ChannelMediaSaveRequest,
  type ChannelMediaSaveResult,
} from '@/features/channels/contracts'

interface PendingSave {
  listener: ChannelMediaSaveProgressListener
  resolve: (result: ChannelMediaSaveResult) => void
  reject: (error: unknown) => void
}

export class MockChannelMediaClient implements ChannelMediaClient {
  readonly requests: ChannelMediaSaveRequest[] = []
  readonly cancelRequests: string[] = []
  private readonly pending = new Map<string, PendingSave>()
  private disposed = false

  save(
    request: ChannelMediaSaveRequest,
    listener: ChannelMediaSaveProgressListener,
  ): Promise<ChannelMediaSaveResult> {
    if (this.disposed) return Promise.reject(new ChannelMediaClientError('unknown', false))
    if (this.pending.has(request.operationId))
      return Promise.reject(new ChannelMediaClientError('invalidRequest', false))
    this.requests.push(structuredClone(request))
    return new Promise((resolve, reject) => {
      this.pending.set(request.operationId, { listener, resolve, reject })
    })
  }

  async cancel(operationId: string): Promise<void> {
    if (this.disposed || this.cancelRequests.includes(operationId)) return
    this.cancelRequests.push(operationId)
    this.resolve(operationId, { status: 'cancelled' })
  }

  emit(event: ChannelMediaSaveProgressEvent): void {
    this.pending.get(event.operationId)?.listener(structuredClone(event))
  }

  resolve(operationId: string, result: ChannelMediaSaveResult): void {
    const pending = this.pending.get(operationId)
    if (!pending) return
    this.pending.delete(operationId)
    pending.resolve(structuredClone(result))
  }

  reject(operationId: string, error: unknown): void {
    const pending = this.pending.get(operationId)
    if (!pending) return
    this.pending.delete(operationId)
    pending.reject(error)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const operationId of [...this.pending.keys()])
      this.resolve(operationId, { status: 'cancelled' })
  }
}
