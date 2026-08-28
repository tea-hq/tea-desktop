import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export interface JsonStoreOptions {
  maxBytes?: number
  schemaVersion: number
}

export class JsonStore<T> {
  private readonly maxBytes: number
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly options: JsonStoreOptions,
  ) {
    this.maxBytes = options.maxBytes ?? 4 * 1024 * 1024
  }

  async load(defaultValue: T): Promise<T> {
    let bytes: Buffer
    try {
      bytes = await fs.readFile(this.filePath)
    } catch (error) {
      if (isMissingFile(error)) return structuredClone(defaultValue)
      throw storageError('reading JSON state')
    }

    if (bytes.byteLength > this.maxBytes)
      return this.recover(defaultValue, 'file exceeds size limit')

    let value: unknown
    try {
      value = JSON.parse(bytes.toString('utf8'))
    } catch {
      return this.recover(defaultValue, 'invalid JSON')
    }
    if (!isRecord(value) || value.schemaVersion !== this.options.schemaVersion) {
      return this.recover(defaultValue, 'schema version is missing or unsupported')
    }
    return structuredClone(value.data as T)
  }

  save(value: T): Promise<void> {
    const next = this.writeQueue.catch(() => undefined).then(() => this.writeNow(value))
    this.writeQueue = next
    return next
  }

  private async writeNow(value: T): Promise<void> {
    const parent = path.dirname(this.filePath)
    await fs.mkdir(parent, { recursive: true }).catch(() => {
      throw storageError('creating JSON state directory')
    })
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
    const bytes = `${JSON.stringify({ schemaVersion: this.options.schemaVersion, data: value }, null, 2)}\n`
    if (Buffer.byteLength(bytes, 'utf8') > this.maxBytes)
      throw storageError('state exceeds size limit')
    try {
      await fs.writeFile(temporary, bytes, { encoding: 'utf8', flag: 'wx' })
      await fs.rename(temporary, this.filePath)
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
      throw storageError('writing JSON state')
    }
  }

  private async recover(defaultValue: T, reason: string): Promise<T> {
    const preserved = `${this.filePath}.${process.pid}.${Date.now()}.corrupt.json`
    try {
      await fs.rename(this.filePath, preserved)
    } catch {
      throw serviceError('storageFailure', true, `could not preserve corrupt state: ${reason}`)
    }
    return structuredClone(defaultValue)
  }
}

export function serviceError(
  code: string,
  retryable: boolean,
  message?: string,
): { code: string; retryable: boolean; message?: string } {
  return { code, retryable, ...(message ? { message } : {}) }
}

function storageError(operation: string): {
  code: string
  retryable: boolean
  message: string
} {
  return { code: 'storageFailure', retryable: true, message: operation }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(value: unknown): boolean {
  return isRecord(value) && value.code === 'ENOENT'
}
