import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process'
import { Readable, Transform, Writable, type TransformCallback } from 'node:stream'

import type { AcpAgentDefinition, ResolvedAcpAgentArtifact } from './agentDefinition'
import { AcpHostError } from './errors'

export const MAX_ACP_MESSAGE_BYTES = 1024 * 1024
export const MAX_AGENT_DIAGNOSTIC_BYTES = 64 * 1024
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000

const INHERITED_ENVIRONMENT_KEYS = [
  'APPDATA',
  'HOME',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'NO_COLOR',
  'PATH',
  'SHELL',
  'SystemRoot',
  'TEMP',
  'TERM',
  'TMPDIR',
  'USER',
  'WINDIR',
] as const
const INHERITED_ENVIRONMENT_KEY_SET = new Set<string>(INHERITED_ENVIRONMENT_KEYS)
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface AcpChildProcess {
  readonly pid?: number
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly killed: boolean
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  once(event: 'spawn', listener: () => void): this
  once(event: 'error', listener: (error: Error) => void): this
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  kill(signal?: NodeJS.Signals): boolean
}

export type AcpProcessSpawner = (
  executable: string,
  arguments_: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => AcpChildProcess

export interface AcpProcessExit {
  code: number | null
  signal: NodeJS.Signals | null
  error?: Error
}

export interface LaunchAcpAgentOptions {
  cwd: string
  nodeExecutable?: string
  environment?: Readonly<AcpEnvironment>
  injectedEnvironment?: Readonly<AcpEnvironment>
  shutdownTimeoutMs?: number
}

export interface AcpProcess {
  readonly definition: AcpAgentDefinition
  readonly artifact: ResolvedAcpAgentArtifact
  readonly stdin: Writable
  readonly stdout: Readable
  readonly started: Promise<void>
  readonly closed: Promise<AcpProcessExit>
  diagnostics(): string
  close(): Promise<void>
}

export class AcpProcessLauncher {
  constructor(
    private readonly spawnProcess: AcpProcessSpawner = defaultSpawner,
    private readonly hostExecutable = process.execPath,
  ) {}

  launch(artifact: ResolvedAcpAgentArtifact, options: LaunchAcpAgentOptions): AcpProcess {
    const executable = options.nodeExecutable ?? this.hostExecutable
    const environment = buildAgentEnvironment(
      options.environment ?? process.env,
      options.injectedEnvironment,
    )
    if (isElectronRuntime(executable)) environment.ELECTRON_RUN_AS_NODE = '1'

    let child: AcpChildProcess
    try {
      child = this.spawnProcess(
        executable,
        [artifact.entrypointPath, ...artifact.definition.arguments],
        {
          cwd: options.cwd,
          env: environment as NodeJS.ProcessEnv,
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
    } catch (error) {
      throw new AcpHostError(
        'processStartFailed',
        `ACP Agent process could not be started: ${artifact.definition.id}`,
        true,
        { cause: error },
      )
    }

    return new ManagedAcpProcess(
      artifact,
      child,
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    )
  }
}

class ManagedAcpProcess implements AcpProcess {
  readonly definition: AcpAgentDefinition
  readonly stdin: Writable
  readonly stdout: Readable
  readonly started: Promise<void>
  readonly closed: Promise<AcpProcessExit>

  private readonly diagnosticBuffer = new BoundedTextBuffer(MAX_AGENT_DIAGNOSTIC_BYTES)
  private exited = false
  private closePromise: Promise<void> | null = null

  constructor(
    readonly artifact: ResolvedAcpAgentArtifact,
    private readonly child: AcpChildProcess,
    private readonly shutdownTimeoutMs: number,
  ) {
    this.definition = artifact.definition
    this.stdin = child.stdin
    const boundedOutput = new BoundedLineTransform(MAX_ACP_MESSAGE_BYTES)
    child.stdout.pipe(boundedOutput)
    this.stdout = boundedOutput
    child.stderr.on('data', (chunk: Buffer | string) => this.diagnosticBuffer.append(chunk))

    this.started = new Promise((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', (error) =>
        reject(
          new AcpHostError(
            'processStartFailed',
            `ACP Agent process failed during startup: ${artifact.definition.id}`,
            true,
            { cause: error },
          ),
        ),
      )
    })
    this.closed = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        this.exited = true
        resolve({ code, signal })
      })
      child.once('error', (error) => {
        this.exited = true
        resolve({ code: null, signal: null, error })
      })
    })
  }

  diagnostics(): string {
    return this.diagnosticBuffer.toString()
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeOnce()
    return this.closePromise
  }

  private async closeOnce(): Promise<void> {
    if (this.exited || this.child.exitCode !== null || this.child.signalCode !== null) return
    this.stdin.end()
    if (!this.child.killed) this.child.kill('SIGTERM')
    const exited = await waitFor(this.closed, this.shutdownTimeoutMs)
    if (!exited && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGKILL')
      await waitFor(this.closed, this.shutdownTimeoutMs)
    }
  }
}

export class BoundedLineTransform extends Transform {
  private currentLineBytes = 0

  constructor(private readonly maxLineBytes: number) {
    super()
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    let segmentStart = 0
    for (let index = 0; index < value.length; index += 1) {
      if (value.at(index) !== 0x0a) continue
      this.currentLineBytes += index - segmentStart
      if (this.currentLineBytes > this.maxLineBytes) {
        callback(lineTooLong(this.maxLineBytes))
        return
      }
      this.currentLineBytes = 0
      segmentStart = index + 1
    }
    this.currentLineBytes += value.length - segmentStart
    if (this.currentLineBytes > this.maxLineBytes) {
      callback(lineTooLong(this.maxLineBytes))
      return
    }
    callback(null, value)
  }
}

export function buildAgentEnvironment(
  source: Readonly<AcpEnvironment>,
  injected: Readonly<AcpEnvironment> = {},
): AcpEnvironment {
  return Object.fromEntries([
    ...Object.entries(source).filter(
      ([key, value]) =>
        INHERITED_ENVIRONMENT_KEY_SET.has(key) && value !== undefined && !value.includes('\0'),
    ),
    ...Object.entries(injected).filter(
      ([key, value]) => ENVIRONMENT_NAME.test(key) && value !== undefined && !value.includes('\0'),
    ),
  ])
}

type AcpEnvironment = Record<string, string | undefined>

class BoundedTextBuffer {
  private value = Buffer.alloc(0)

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer | string): void {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const combined = Buffer.concat([this.value, incoming])
    this.value =
      combined.length > this.maxBytes
        ? combined.subarray(combined.length - this.maxBytes)
        : combined
  }

  toString(): string {
    return this.value.toString('utf8')
  }
}

const defaultSpawner: AcpProcessSpawner = (executable, arguments_, options) =>
  spawn(executable, [...arguments_], options) as unknown as AcpChildProcess

function isElectronRuntime(executable: string): boolean {
  const versions = process.versions as NodeJS.ProcessVersions & { electron?: string }
  return executable === process.execPath && Boolean(versions.electron)
}

function lineTooLong(maxBytes: number): AcpHostError {
  return new AcpHostError(
    'protocolLineTooLong',
    `ACP protocol line exceeds the ${maxBytes} byte limit`,
  )
}

async function waitFor<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  const result = await Promise.race([promise.then(() => true as const), timedOut])
  if (timer) clearTimeout(timer)
  return result
}
