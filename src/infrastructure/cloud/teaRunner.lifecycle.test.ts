import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { describe, expect, it } from 'vitest'
import { type RunnerLogger } from '../../../packages/runner/src/logger'
import { TeaRunner, type RunnerScheduler } from '../../../packages/runner/src/runner'

describe('TeaRunner lifecycle', () => {
  it('keeps the service alive and schedules reconnect when the first connection fails', async () => {
    const callbacks = new Set<() => void>()
    const scheduler: RunnerScheduler = {
      setTimeout: (callback) => {
        callbacks.add(callback)
        return callback
      },
      clearTimeout: (handle) => callbacks.delete(handle as () => void),
    }
    const errors: Error[] = []
    const messages: string[] = []
    const logger: RunnerLogger = {
      debug: (message) => messages.push(message),
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
      error: (message) => messages.push(message),
    }
    const runner = new TeaRunner(
      {
        centerUrl: 'https://center.test',
        workspaceRoot: '/tmp/tea-runner-lifecycle',
        stateDir: '/tmp/tea-runner-lifecycle-state',
        runners: [
          {
            localKey: 'runner-lifecycle',
            token: 'secret',
            displayName: 'Lifecycle',
            tags: ['linux'],
          },
        ],
      },
      {
        WebSocket: FailingWebSocket as unknown as typeof WebSocket,
        scheduler,
        logger,
        onError: (error) => errors.push(error),
      },
    )

    await expect(runner.start()).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toBe('center unavailable')
    expect(callbacks).toHaveLength(1)
    expect(messages).toContain('runner starting')
    expect(messages).toContain('connecting to Center')
    expect(messages).toContain('runner error')
    expect(messages.join('\n')).not.toContain('secret')

    await runner.stop({ force: true })
    expect(callbacks).toHaveLength(0)
  })

  it('reports an invalid token once without scheduling a reconnect', async () => {
    const callbacks = new Set<() => void>()
    const scheduler: RunnerScheduler = {
      setTimeout: (callback) => {
        callbacks.add(callback)
        return callback
      },
      clearTimeout: (handle) => callbacks.delete(handle as () => void),
    }
    const errors: Error[] = []
    const logEntries: Array<{ message: string; fields?: Readonly<Record<string, unknown>> }> = []
    const runner = new TeaRunner(
      {
        centerUrl: 'https://center.test',
        workspaceRoot: '/tmp/tea-runner-attachment-error',
        stateDir: '/tmp/tea-runner-attachment-error-state',
        runners: [
          {
            localKey: 'runner-invalid-token',
            token: 'secret',
            displayName: 'Invalid token',
            tags: ['linux'],
          },
        ],
      },
      {
        WebSocket: AttachmentRejectingWebSocket as unknown as typeof WebSocket,
        scheduler,
        logger: {
          debug: (message, fields) => logEntries.push({ message, fields }),
          info: (message, fields) => logEntries.push({ message, fields }),
          warn: (message, fields) => logEntries.push({ message, fields }),
          error: (message, fields) => logEntries.push({ message, fields }),
        },
        onError: (error) => errors.push(error),
      },
    )

    await expect(runner.start()).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toBe('runner token is invalid')
    const runnerErrors = logEntries.filter((entry) => entry.message === 'runner error')
    expect(runnerErrors).toHaveLength(1)
    expect(runnerErrors[0]?.fields).toMatchObject({
      code: 'invalid_token',
      localKey: 'runner-invalid-token',
    })
    expect(callbacks).toHaveLength(0)

    await runner.stop({ force: true })
    expect(callbacks).toHaveLength(0)
  })

  it('keeps valid attachments online when another attachment is rejected', async () => {
    const callbacks = new Set<() => void>()
    const scheduler: RunnerScheduler = {
      setTimeout: (callback) => {
        callbacks.add(callback)
        return callback
      },
      clearTimeout: (handle) => callbacks.delete(handle as () => void),
    }
    const errors: Error[] = []
    const logEntries: Array<{ message: string; fields?: Readonly<Record<string, unknown>> }> = []
    const runner = new TeaRunner(
      {
        centerUrl: 'https://center.test',
        workspaceRoot: '/tmp/tea-runner-partial-attachment',
        stateDir: '/tmp/tea-runner-partial-attachment-state',
        runners: [
          {
            localKey: 'runner-invalid-token',
            token: 'invalid',
            displayName: 'Invalid token',
            tags: ['linux'],
          },
          {
            localKey: 'runner-valid-token',
            token: 'valid',
            displayName: 'Valid token',
            tags: ['linux'],
          },
        ],
      },
      {
        WebSocket: PartiallyAcceptingWebSocket as unknown as typeof WebSocket,
        scheduler,
        logger: {
          debug: (message, fields) => logEntries.push({ message, fields }),
          info: (message, fields) => logEntries.push({ message, fields }),
          warn: (message, fields) => logEntries.push({ message, fields }),
          error: (message, fields) => logEntries.push({ message, fields }),
        },
        onError: (error) => errors.push(error),
      },
    )

    await expect(runner.start()).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toBe('runner token is invalid')
    expect(runner.getRegistrations().map((registration) => registration.localKey)).toEqual([
      'runner-valid-token',
    ])
    expect(logEntries.filter((entry) => entry.message === 'runner connection ready')).toHaveLength(
      1,
    )
    expect(callbacks).toHaveLength(0)

    await runner.stop({ force: true })
  })
})

class FailingWebSocket extends EventEmitter {
  static readonly OPEN = 1
  readyState = 0

  constructor(_url: string) {
    super()
    queueMicrotask(() => this.emit('error', new Error('center unavailable')))
  }

  send(_data: string, callback?: (error?: Error) => void): void {
    callback?.()
  }

  close(): void {
    this.readyState = 3
    this.emit('close')
  }
}

class AttachmentRejectingWebSocket extends EventEmitter {
  static readonly OPEN = 1
  readyState = 0

  constructor(_url: string) {
    super()
    queueMicrotask(() => {
      this.readyState = AttachmentRejectingWebSocket.OPEN
      this.emit('open')
    })
  }

  send(data: string, callback?: (error?: Error) => void): void {
    callback?.()
    const message = JSON.parse(data) as { type?: string; messageId?: string; localKey?: string }
    if (message.type !== 'runner.attach') return
    queueMicrotask(() =>
      this.emit(
        'message',
        Buffer.from(
          JSON.stringify({
            version: 1,
            messageId: `error-${message.messageId}`,
            correlationId: message.messageId,
            type: 'runner.error',
            localKey: message.localKey,
            payload: { code: 'invalid_token', message: 'runner token is invalid' },
          }),
        ),
      ),
    )
  }

  close(): void {
    this.readyState = 3
    this.emit('close', 1000)
  }
}

class PartiallyAcceptingWebSocket extends EventEmitter {
  static readonly OPEN = 1
  readyState = 0

  constructor(_url: string) {
    super()
    queueMicrotask(() => {
      this.readyState = PartiallyAcceptingWebSocket.OPEN
      this.emit('open')
    })
  }

  send(data: string, callback?: (error?: Error) => void): void {
    callback?.()
    const message = JSON.parse(data) as {
      type?: string
      messageId?: string
      localKey?: string
      payload?: { localKey?: string }
    }
    if (message.type !== 'runner.attach') return
    const localKey = message.localKey ?? message.payload?.localKey
    if (localKey === 'runner-invalid-token') {
      queueMicrotask(() =>
        this.emit(
          'message',
          Buffer.from(
            JSON.stringify({
              version: 1,
              messageId: `error-${message.messageId}`,
              correlationId: message.messageId,
              type: 'runner.error',
              localKey,
              payload: { code: 'invalid_token', message: 'runner token is invalid' },
            }),
          ),
        ),
      )
      return
    }
    queueMicrotask(() =>
      this.emit(
        'message',
        Buffer.from(
          JSON.stringify({
            version: 1,
            messageId: `attached-${message.messageId}`,
            correlationId: message.messageId,
            type: 'runner.attached',
            localKey,
            runnerId: 'runner-valid',
            instanceId: 'instance-valid',
            attachmentId: 'instance-valid',
            payload: {
              runnerId: 'runner-valid',
              localKey,
              instanceId: 'instance-valid',
              attachmentId: 'instance-valid',
              tags: ['linux'],
              workspaceRoot: '/tmp/tea-runner-partial-attachment',
              limit: 5,
              epoch: 1,
            },
          }),
        ),
      ),
    )
  }

  close(): void {
    this.readyState = 3
    this.emit('close', 1000)
  }
}
