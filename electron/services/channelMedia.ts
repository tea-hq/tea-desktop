import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type {
  ChannelMediaSaveProgressEvent,
  ChannelMediaSaveRequest,
  ChannelMediaSaveResult,
  ChannelMediaSaveErrorCode,
} from '../../src/features/channels/contracts'
import {
  ChannelMediaSourceError,
  type ChannelMediaSource,
  type ChannelMediaSourceResolver,
} from '../../src/infrastructure/channels/channelMediaSource'

const DEFAULT_MAXIMUM_BYTES = 1024 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAXIMUM_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type ChannelMediaFetch = (url: URL, init: RequestInit) => Promise<Response>
export type ChannelMediaDestinationPicker = (source: ChannelMediaSource) => Promise<string | null>
export type ChannelMediaProgressEmitter = (event: ChannelMediaSaveProgressEvent) => void

interface ChannelMediaFileSystem {
  open: typeof fs.open
  rename: typeof fs.rename
  unlink: typeof fs.unlink
}

interface ActiveSave {
  controller: AbortController
  cancelled: boolean
}

export interface ChannelMediaSaveServiceOptions {
  fetchMedia?: ChannelMediaFetch
  fileSystem?: Partial<ChannelMediaFileSystem>
  maximumBytes?: number
  timeoutMs?: number
  maximumRedirects?: number
  createId?: () => string
  scheduleTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearScheduledTimeout?: (timer: ReturnType<typeof setTimeout>) => void
}

export class ChannelMediaSaveService {
  private readonly active = new Map<string, ActiveSave>()
  private readonly operations = new Set<Promise<ChannelMediaSaveResult>>()
  private readonly fetchMedia: ChannelMediaFetch
  private readonly fileSystem: ChannelMediaFileSystem
  private readonly maximumBytes: number
  private readonly timeoutMs: number
  private readonly maximumRedirects: number
  private readonly createId: () => string
  private readonly scheduleTimeout: NonNullable<ChannelMediaSaveServiceOptions['scheduleTimeout']>
  private readonly clearScheduledTimeout: NonNullable<
    ChannelMediaSaveServiceOptions['clearScheduledTimeout']
  >
  private disposed = false

  constructor(
    private readonly sourceResolver: ChannelMediaSourceResolver,
    private readonly selectDestination: ChannelMediaDestinationPicker,
    private readonly emitProgress: ChannelMediaProgressEmitter,
    options: ChannelMediaSaveServiceOptions = {},
  ) {
    this.fetchMedia = options.fetchMedia ?? ((url, init) => fetch(url, init))
    this.fileSystem = {
      open: options.fileSystem?.open ?? fs.open,
      rename: options.fileSystem?.rename ?? fs.rename,
      unlink: options.fileSystem?.unlink ?? fs.unlink,
    }
    this.maximumBytes = positiveInteger(options.maximumBytes, DEFAULT_MAXIMUM_BYTES)
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS)
    this.maximumRedirects = nonNegativeInteger(options.maximumRedirects, DEFAULT_MAXIMUM_REDIRECTS)
    this.createId = options.createId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout
  }

  save(request: ChannelMediaSaveRequest): Promise<ChannelMediaSaveResult> {
    try {
      this.assertUsable()
      validateOperationId(request.operationId)
    } catch (error) {
      return Promise.reject(error)
    }
    if (this.active.has(request.operationId))
      return Promise.reject(serviceError('invalidRequest', false))
    const context: ActiveSave = { controller: new AbortController(), cancelled: false }
    this.active.set(request.operationId, context)
    const operation = this.performSave(request, context).finally(() => {
      if (this.active.get(request.operationId) === context) this.active.delete(request.operationId)
      this.operations.delete(operation)
    })
    this.operations.add(operation)
    return operation
  }

  cancel(operationId: string): void {
    validateOperationId(operationId)
    const context = this.active.get(operationId)
    if (!context || context.cancelled) return
    context.cancelled = true
    context.controller.abort(new Error('cancelled'))
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const operationId of [...this.active.keys()]) this.cancel(operationId)
    await Promise.allSettled([...this.operations])
  }

  private async performSave(
    request: ChannelMediaSaveRequest,
    context: ActiveSave,
  ): Promise<ChannelMediaSaveResult> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let temporaryPath: string | undefined
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined
    try {
      const source = this.resolveSource(request)
      if (source.expectedSize !== undefined && source.expectedSize > this.maximumBytes)
        throw serviceError('tooLarge', false)
      const destination = await this.pickDestination(source)
      if (context.cancelled) return { status: 'cancelled' }
      if (destination === null) return { status: 'cancelled' }
      validateDestination(destination)
      timer = this.scheduleTimeout(
        () => context.controller.abort(new Error('timeout')),
        this.timeoutMs,
      )
      const response = await this.fetchResponse(source.url, context.controller.signal)
      if (context.cancelled) return { status: 'cancelled' }
      const declaredLength = responseLength(response)
      if (declaredLength !== undefined && declaredLength > this.maximumBytes)
        throw serviceError('tooLarge', false)
      temporaryPath = siblingTemporaryPath(destination, this.createId())
      try {
        handle = await this.fileSystem.open(temporaryPath, 'wx', 0o600)
      } catch {
        throw serviceError('writeFailed', true)
      }
      const byteLength = await this.writeResponse(
        response,
        handle,
        request.operationId,
        declaredLength ?? source.expectedSize,
        context,
      )
      if (context.cancelled) return { status: 'cancelled' }
      if (declaredLength !== undefined && declaredLength !== byteLength)
        throw serviceError('downloadFailed', true)
      try {
        await handle.sync()
        await handle.close()
        handle = undefined
        await this.fileSystem.rename(temporaryPath, destination)
        temporaryPath = undefined
      } catch {
        throw serviceError('writeFailed', true)
      }
      return { status: 'saved', fileName: path.basename(destination), byteLength }
    } catch (error) {
      if (context.cancelled) return { status: 'cancelled' }
      if (error instanceof ChannelMediaSaveServiceError) throw error
      if (error instanceof ChannelMediaSourceError) throw serviceError(error.code, error.retryable)
      throw serviceError('downloadFailed', true)
    } finally {
      if (timer) this.clearScheduledTimeout(timer)
      if (handle) await handle.close().catch(() => undefined)
      if (temporaryPath) {
        await this.fileSystem.unlink(temporaryPath).catch(() => undefined)
      }
    }
  }

  private resolveSource(request: ChannelMediaSaveRequest): ChannelMediaSource {
    const source = this.sourceResolver.resolveMediaSource(request.messageRef)
    const url = parseHttpsUrl(source.url)
    return {
      ...source,
      url: url.toString(),
      fileName: safeFileName(source.fileName),
    }
  }

  private async pickDestination(source: ChannelMediaSource): Promise<string | null> {
    try {
      return await this.selectDestination(structuredClone(source))
    } catch {
      throw serviceError('writeFailed', true)
    }
  }

  private async fetchResponse(sourceUrl: string, signal: AbortSignal): Promise<Response> {
    let current = parseHttpsUrl(sourceUrl)
    for (let redirectCount = 0; ; redirectCount += 1) {
      let response: Response
      try {
        response = await this.fetchMedia(current, { redirect: 'manual', signal })
      } catch {
        throw serviceError('downloadFailed', true)
      }
      if (!REDIRECT_STATUSES.has(response.status)) {
        if (!response.ok) throw serviceError('downloadFailed', true)
        return response
      }
      if (redirectCount >= this.maximumRedirects) throw serviceError('downloadFailed', false)
      const location = response.headers.get('location')
      if (!location) throw serviceError('downloadFailed', false)
      await response.body?.cancel().catch(() => undefined)
      current = parseHttpsUrl(new URL(location, current).toString())
    }
  }

  private async writeResponse(
    response: Response,
    handle: Awaited<ReturnType<typeof fs.open>>,
    operationId: string,
    totalBytes: number | undefined,
    context: ActiveSave,
  ): Promise<number> {
    let receivedBytes = 0
    this.publishProgress(operationId, receivedBytes, totalBytes)
    const reader = response.body?.getReader()
    if (!reader) return 0
    try {
      while (true) {
        let item: ReadableStreamReadResult<Uint8Array>
        try {
          item = await reader.read()
        } catch {
          throw serviceError('downloadFailed', true)
        }
        if (item.done) break
        if (context.cancelled) return receivedBytes
        receivedBytes += item.value.byteLength
        if (receivedBytes > this.maximumBytes) throw serviceError('tooLarge', false)
        try {
          await handle.write(item.value)
        } catch {
          throw serviceError('writeFailed', true)
        }
        this.publishProgress(operationId, receivedBytes, totalBytes)
      }
      return receivedBytes
    } finally {
      reader.releaseLock()
    }
  }

  private publishProgress(
    operationId: string,
    receivedBytes: number,
    totalBytes: number | undefined,
  ): void {
    this.emitProgress({
      operationId,
      phase: 'saving',
      receivedBytes,
      ...(totalBytes !== undefined ? { totalBytes } : {}),
    })
  }

  private assertUsable(): void {
    if (this.disposed) throw serviceError('invalidRequest', false)
  }
}

export class ChannelMediaSaveServiceError extends Error {
  constructor(
    readonly code: ChannelMediaSaveErrorCode,
    readonly retryable: boolean,
  ) {
    super(code)
    this.name = 'ChannelMediaSaveServiceError'
  }
}

function serviceError(
  code: ChannelMediaSaveErrorCode,
  retryable: boolean,
): ChannelMediaSaveServiceError {
  return new ChannelMediaSaveServiceError(code, retryable)
}

function parseHttpsUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw serviceError('unsupportedProtocol', false)
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw serviceError('unsupportedProtocol', false)
  return url
}

function safeFileName(value: string): string {
  const name = path.basename(value.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '')
  const bounded = name.trim().slice(0, 180)
  return bounded && bounded !== '.' && bounded !== '..' ? bounded : 'attachment'
}

function validateDestination(value: string): void {
  if (!value || value.length > 4_096 || value.includes('\0'))
    throw serviceError('invalidRequest', false)
}

function validateOperationId(value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw serviceError('invalidRequest', false)
}

function responseLength(response: Response): number | undefined {
  const value = response.headers.get('content-length')
  if (value === null) return undefined
  if (!/^\d+$/.test(value)) throw serviceError('downloadFailed', true)
  const length = Number(value)
  if (!Number.isSafeInteger(length)) throw serviceError('tooLarge', false)
  return length
}

function siblingTemporaryPath(destination: string, id: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'temporary'
  return path.join(path.dirname(destination), `.${path.basename(destination)}.tea-${safeId}.part`)
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0 ? value : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 0 ? value : fallback
}
