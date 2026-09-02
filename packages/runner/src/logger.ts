import { chmod, mkdir, open } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { stderr } from 'node:process'
import pino, { type Logger as PinoLogger, type DestinationStream } from 'pino'
import pretty from 'pino-pretty'

export type RunnerLogFields = Readonly<Record<string, unknown>>
export type RunnerLogLevel = 'debug' | 'info' | 'warn' | 'error'

/** The runtime depends on this small port instead of a particular log sink. */
export interface RunnerLogger {
  debug(message: string, fields?: RunnerLogFields): void
  info(message: string, fields?: RunnerLogFields): void
  warn(message: string, fields?: RunnerLogFields): void
  error(message: string, fields?: RunnerLogFields): void
}

export interface RunnerLoggerHandle {
  logger: RunnerLogger
  logPath?: string
  close(): void
}

export type RunnerLogMode = 'foreground' | 'service'

export interface RunnerLoggerOptions {
  mode: RunnerLogMode
  cacheDirectory?: string
  environment?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
}

const NOOP_LOGGER: RunnerLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

export function createNoopRunnerLogger(): RunnerLogger {
  return NOOP_LOGGER
}

export function runnerCacheDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDirectory = os.homedir(),
): string {
  const configured = environment.TEA_RUNNER_CACHE_DIR?.trim()
  if (configured) return path.resolve(configured)

  const base =
    platform === 'win32'
      ? environment.LOCALAPPDATA?.trim() || path.join(homeDirectory, 'AppData', 'Local')
      : environment.XDG_CACHE_HOME?.trim() ||
        (platform === 'darwin'
          ? path.join(homeDirectory, 'Library', 'Caches')
          : path.join(homeDirectory, '.cache'))
  return path.join(base, 'tea', 'runner')
}

export function runnerLogPath(options: Omit<RunnerLoggerOptions, 'mode'> = {}): string {
  return path.join(
    options.cacheDirectory ??
      runnerCacheDirectory(options.environment, options.platform, options.homeDirectory),
    'runner.log',
  )
}

export async function createRunnerLogger(
  options: RunnerLoggerOptions,
): Promise<RunnerLoggerHandle> {
  if (options.mode === 'foreground') {
    const output = pretty({
      colorize: Boolean(stderr.isTTY),
      destination: stderr.fd ?? 2,
      levelFirst: true,
      singleLine: true,
      translateTime: 'SYS:standard',
      sync: true,
    })
    const instance = pino({ level: 'debug', name: 'tea-runner' }, output)
    return { logger: adaptPinoLogger(instance), close: () => flush(output) }
  }

  const logPath = runnerLogPath(options)
  await ensurePrivateLogPath(logPath)
  const destination = pino.destination({ dest: logPath, sync: true })
  const instance = pino({ level: 'debug', name: 'tea-runner' }, destination)
  return {
    logger: adaptPinoLogger(instance),
    logPath,
    close: () => flush(destination),
  }
}

function adaptPinoLogger(instance: PinoLogger): RunnerLogger {
  return {
    debug: (message, fields) => writeLog(instance, 'debug', message, fields),
    info: (message, fields) => writeLog(instance, 'info', message, fields),
    warn: (message, fields) => writeLog(instance, 'warn', message, fields),
    error: (message, fields) => writeLog(instance, 'error', message, fields),
  }
}

function writeLog(
  instance: PinoLogger,
  level: RunnerLogLevel,
  message: string,
  fields?: RunnerLogFields,
): void {
  if (fields && Object.keys(fields).length > 0) {
    instance[level](fields as Record<string, unknown>, message)
  } else {
    instance[level](message)
  }
}

async function ensurePrivateLogPath(logPath: string): Promise<void> {
  const directory = path.dirname(logPath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const handle = await open(logPath, 'a', 0o600)
  try {
    await handle.chmod(0o600)
  } finally {
    await handle.close()
  }
}

function flush(stream: DestinationStream): void {
  if ('flushSync' in stream && typeof stream.flushSync === 'function') stream.flushSync()
}
