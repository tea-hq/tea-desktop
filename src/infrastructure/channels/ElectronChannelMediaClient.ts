import {
  ChannelMediaClientError,
  type ChannelMediaClient,
  type ChannelMediaSaveErrorCode,
  type ChannelMediaSaveProgressListener,
  type ChannelMediaSaveRequest,
  type ChannelMediaSaveResult,
} from '@/features/channels/contracts'
import { invoke, listen, type UnlistenFn } from '../electronBridge'

const knownErrorCodes = new Set<ChannelMediaSaveErrorCode>([
  'invalidRequest',
  'messageUnavailable',
  'mediaUnavailable',
  'unsupportedProtocol',
  'tooLarge',
  'downloadFailed',
  'writeFailed',
  'unknown',
])

export class ElectronChannelMediaClient implements ChannelMediaClient {
  private readonly listeners = new Map<string, ChannelMediaSaveProgressListener>()
  private readonly cancelled = new Set<string>()
  private unlisten: Promise<UnlistenFn> | null = null
  private disposed = false

  async save(
    request: ChannelMediaSaveRequest,
    listener: ChannelMediaSaveProgressListener,
  ): Promise<ChannelMediaSaveResult> {
    this.assertUsable()
    if (this.listeners.has(request.operationId))
      throw new ChannelMediaClientError('invalidRequest', false)
    await this.ensureListening()
    this.assertUsable()
    this.cancelled.delete(request.operationId)
    this.listeners.set(request.operationId, listener)
    try {
      const result = await invoke<ChannelMediaSaveResult>('save_channel_media', { request })
      return readResult(result)
    } catch (error) {
      throw mapError(error)
    } finally {
      this.listeners.delete(request.operationId)
    }
  }

  async cancel(operationId: string): Promise<void> {
    this.assertUsable()
    if (this.cancelled.has(operationId)) return
    this.cancelled.add(operationId)
    try {
      await invoke('cancel_channel_media_save', { operationId })
    } catch (error) {
      this.cancelled.delete(operationId)
      throw mapError(error)
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.cancelled.clear()
    const unlisten = this.unlisten
    this.unlisten = null
    if (unlisten) (await unlisten)()
  }

  private ensureListening(): Promise<UnlistenFn> {
    if (!this.unlisten) {
      this.unlisten = listen('channel-media-save-progress', ({ payload }) => {
        if (this.disposed) return
        this.listeners.get(payload.operationId)?.(structuredClone(payload))
      })
    }
    return this.unlisten
  }

  private assertUsable(): void {
    if (this.disposed) throw new ChannelMediaClientError('unknown', false)
  }
}

function readResult(value: unknown): ChannelMediaSaveResult {
  if (!isRecord(value) || typeof value.status !== 'string') throw malformedResult()
  if (value.status === 'cancelled') return { status: 'cancelled' }
  if (
    value.status !== 'saved' ||
    typeof value.fileName !== 'string' ||
    !value.fileName.trim() ||
    value.fileName.length > 255 ||
    typeof value.byteLength !== 'number' ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0
  )
    throw malformedResult()
  return { status: 'saved', fileName: value.fileName, byteLength: value.byteLength }
}

function mapError(value: unknown): ChannelMediaClientError {
  if (value instanceof ChannelMediaClientError) return value
  const candidate = isRecord(value) ? value : null
  const rawCode = candidate?.code
  const code =
    typeof rawCode === 'string' && knownErrorCodes.has(rawCode as ChannelMediaSaveErrorCode)
      ? (rawCode as ChannelMediaSaveErrorCode)
      : 'unknown'
  return new ChannelMediaClientError(code, candidate?.retryable === true)
}

function malformedResult(): ChannelMediaClientError {
  return new ChannelMediaClientError('unknown', true)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
