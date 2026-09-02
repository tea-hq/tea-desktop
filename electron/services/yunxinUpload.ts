import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { once } from 'node:events'
import path from 'node:path'
import { URL } from 'node:url'

const MAX_RESPONSE_BYTES = 1024 * 1024

export interface NodeYunxinUploadFileOptions {
  filePath?: string
  type?: 'image' | 'audio' | 'video' | 'file'
  maxSize?: number
  md5?: string
  nosToken: {
    bucket: string
    objectName: string
    token: string
  }
  commonUploadHost: string
  commonUploadHostBackupList: string[]
  headers?: Record<string, string>
  onUploadStart?: (task: { abort: () => void }) => void
  onUploadProgress?: (progress: {
    total: number
    loaded: number
    percentage: number
    percentageText: string
  }) => void
  onUploadInfo?: (info: { http_code?: number; exception?: string }) => void
}

export interface NodeYunxinUploadFileResult {
  name: string
  ext: string
  type: string
  size: number
  w?: number
  h?: number
  dur?: number
  md5?: string
}

export interface NodeYunxinUploadPort {
  upload(options: NodeYunxinUploadFileOptions): Promise<NodeYunxinUploadFileResult>
}

interface UploadFailure extends Error {
  code?: number
  retryable?: boolean
}

interface UploadResponse {
  status: number
  body: string
}

/**
 * Streams local files into the same NOS multipart endpoint used by Yunxin's
 * browser/mini-app adapters. The SDK remains responsible for obtaining the
 * token and turning the returned metadata into a message attachment.
 */
export class NodeYunxinUploadAdapter implements NodeYunxinUploadPort {
  async upload(options: NodeYunxinUploadFileOptions): Promise<NodeYunxinUploadFileResult> {
    const filePath = requireFilePath(options.filePath)
    const fileInfo = await stat(filePath).catch(() => null)
    if (!fileInfo?.isFile()) throw uploadFailure('File is not available', undefined, false)
    if (options.maxSize !== undefined && fileInfo.size > options.maxSize)
      throw uploadFailure('File exceeds the upload size limit', undefined, false)
    if (fileInfo.size > 100 * 1024 * 1024)
      throw uploadFailure('File exceeds the upload size limit', undefined, false)

    const token = validateToken(options.nosToken)
    const hosts = uploadHosts(options.commonUploadHost, options.commonUploadHostBackupList)
    const name = path.basename(filePath).slice(0, 512) || 'attachment'
    const ext = extensionOf(name)
    let lastError: unknown

    for (const host of hosts) {
      try {
        const response = await uploadToHost(host, token, filePath, name, fileInfo.size, options)
        return parseUploadResult(response, name, ext, fileInfo.size, options.type, options.md5)
      } catch (error) {
        lastError = error
        if (!isRetryableUploadError(error)) throw error
      }
    }
    throw lastError ?? uploadFailure('File upload failed', undefined, true)
  }
}

function requireFilePath(value: string | undefined): string {
  if (!value || !path.isAbsolute(value) || value.length > 4_096)
    throw uploadFailure('File path is invalid', undefined, false)
  return path.normalize(value)
}

function validateToken(value: NodeYunxinUploadFileOptions['nosToken']): {
  bucket: string
  objectName: string
  token: string
} {
  const bucket = value?.bucket?.trim()
  const objectName = value?.objectName?.trim()
  const token = value?.token?.trim()
  if (!bucket || bucket.length > 256 || !objectName || objectName.length > 4_096 || !token)
    throw uploadFailure('Upload token is invalid', undefined, false)
  return { bucket, objectName, token }
}

function uploadHosts(primary: string, backups: string[]): URL[] {
  const values = [primary, ...backups]
  const seen = new Set<string>()
  const hosts: URL[] = []
  for (const value of values) {
    if (!value) continue
    let url: URL
    try {
      url = new URL(value)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    url.username = ''
    url.password = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    const key = url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    hosts.push(url)
  }
  if (!hosts.length) throw uploadFailure('Upload host is invalid', undefined, false)
  return hosts
}

async function uploadToHost(
  host: URL,
  token: { bucket: string; objectName: string; token: string },
  filePath: string,
  fileName: string,
  fileSize: number,
  options: NodeYunxinUploadFileOptions,
): Promise<UploadResponse> {
  const endpoint = new URL(host.toString())
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/${encodeURIComponent(token.bucket)}`
  const boundary = `----TeaYunxin${randomBytes(16).toString('hex')}`
  const mimeType =
    options.type === 'image'
      ? 'image/*'
      : options.type === 'audio'
        ? 'audio/*'
        : options.type === 'video'
          ? 'video/*'
          : 'application/octet-stream'
  const objectName = decodeURIComponent(token.objectName)
  const prefix = Buffer.concat([
    formField(boundary, 'Object', objectName),
    formField(boundary, 'x-nos-token', token.token),
    formField(boundary, 'x-nos-entity-type', 'json'),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeHeaderValue(fileName)}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  ])
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`)
  const requestHeaders: Record<string, string | number> = {
    ...(options.headers ?? {}),
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': prefix.length + fileSize + suffix.length,
  }
  if (options.md5) requestHeaders['content-md5'] = options.md5

  return new Promise<UploadResponse>((resolve, reject) => {
    let stream: ReturnType<typeof createReadStream> | undefined
    let settled = false
    let aborted = false
    let loaded = 0

    const finish = (error?: unknown, response?: UploadResponse) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else if (response) resolve(response)
      else reject(uploadFailure('File upload failed', undefined, true))
    }
    const abort = () => {
      if (settled || aborted) return
      aborted = true
      stream?.destroy()
      request?.destroy()
      finish(uploadFailure('File upload cancelled', 10499, false))
    }

    const requestFn = endpoint.protocol === 'https:' ? requestHttps : requestHttp
    const request = requestFn(endpoint, { method: 'POST', headers: requestHeaders }, (response) => {
      const chunks: Buffer[] = []
      let responseSize = 0
      response.on('data', (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        responseSize += value.length
        if (responseSize <= MAX_RESPONSE_BYTES) chunks.push(value)
      })
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        const status = response.statusCode ?? 0
        try {
          options.onUploadInfo?.({ http_code: status })
        } catch {
          // SDK reporter callbacks are observational and must not interrupt the upload.
        }
        if (status === 200) finish(undefined, { status, body })
        else finish(uploadFailure('Upload server rejected the file', status, status >= 500))
      })
      response.on('error', (error) => finish(error))
    })
    request.on('error', (error) => {
      if (aborted) return
      finish(uploadFailure('File upload request failed', undefined, true, error))
    })

    try {
      options.onUploadStart?.({ abort })
    } catch (error) {
      abort()
      finish(error)
      return
    }
    if (aborted) return

    void (async () => {
      try {
        request!.write(prefix)
        stream = createReadStream(filePath)
        for await (const chunk of stream) {
          if (aborted) return
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          if (!request!.write(value)) await once(request!, 'drain')
          loaded += value.length
          notifyProgress(options, fileSize, loaded)
        }
        if (fileSize === 0) notifyProgress(options, fileSize, 0)
        if (aborted) return
        request!.end(suffix)
      } catch (error) {
        if (aborted) return
        finish(uploadFailure('File upload failed', undefined, true, error))
        request?.destroy()
      }
    })()
  })
}

function parseUploadResult(
  response: UploadResponse,
  name: string,
  ext: string,
  size: number,
  type: NodeYunxinUploadFileOptions['type'],
  md5: string | undefined,
): NodeYunxinUploadFileResult {
  let value: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(response.body || '{}')
    if (isRecord(parsed)) value = parsed
  } catch {
    throw uploadFailure('Upload server returned invalid metadata', response.status, false)
  }
  const result: NodeYunxinUploadFileResult = {
    name,
    ext,
    type: type ?? 'file',
    size,
    ...(md5 ? { md5 } : {}),
  }
  const width = numberValue(value.w)
  const height = numberValue(value.h)
  const duration = numberValue(value.dur)
  if (width !== undefined) result.w = width
  if (height !== undefined) result.h = height
  if (duration !== undefined) result.dur = duration
  return result
}

function formField(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${safeHeaderValue(name)}"\r\n\r\n${value}\r\n`,
  )
}

function safeHeaderValue(value: string): string {
  return value.replace(/[\r\n"]/g, '_').slice(0, 512)
}

function notifyProgress(options: NodeYunxinUploadFileOptions, total: number, loaded: number): void {
  const percentage = total === 0 ? 1 : Math.min(1, loaded / total)
  options.onUploadProgress?.({
    total,
    loaded,
    percentage,
    percentageText: `${Math.round(percentage * 100)}%`,
  })
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1, dot + 33).toLowerCase() : ''
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uploadFailure(
  message: string,
  code?: number,
  retryable = false,
  cause?: unknown,
): UploadFailure {
  const error = new Error(message, cause === undefined ? undefined : { cause }) as UploadFailure
  if (code !== undefined) error.code = code
  error.retryable = retryable
  return error
}

function isRetryableUploadError(error: unknown): boolean {
  return isRecord(error) && error.retryable === true
}
