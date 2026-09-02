#!/usr/bin/env node
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { createReadStream } from 'node:fs'
import { stderr, stdin, stdout } from 'node:process'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { AcpAgentExecutor } from './acp.js'
import { defaultAcpRunnerAgents } from './defaults.js'
import { createRunnerLogger, runnerLogPath, type RunnerLoggerHandle } from './logger.js'
import { loadRunnerConfig, saveRunnerConfig, type RunnerConfigFile, TeaRunner } from './runner.js'

const DEFAULT_CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(process.env.HOME ?? '.', '.config'),
  'tea',
  'runner.toml',
)

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command =
    args[0] === 'register' || args[0] === 'run' || args[0] === 'install-service'
      ? args.shift()!
      : 'run'
  if (command === 'register') {
    await register(args)
    return
  }
  if (command === 'install-service') {
    const configPath = args[0] ?? DEFAULT_CONFIG_PATH
    await loadRunnerConfig(configPath)
    installService(configPath)
    process.stdout.write('tea-runner service started\n')
    process.stdout.write(`tea-runner logs: ${runnerLogPath()}\n`)
    return
  }
  const configPath = args[0] ?? DEFAULT_CONFIG_PATH
  await run(configPath, args.includes('--force'))
}

async function register(args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const configPath = flags.config ?? DEFAULT_CONFIG_PATH
  const centerUrl =
    flags['center-url'] ?? (await promptValue('Center URL', 'https://center.example.com'))
  const tokenInput =
    flags.token ??
    (stdin.isTTY ? await promptValue('Registration token', '') : await readTokenFromStdin())
  const token = tokenInput.trim()
  if (!token) throw new Error('registration token is required')
  const defaultName = hostname()
  const name = flags.name ?? (await promptValue('Runner name', defaultName))
  const defaultTag = defaultRunnerTag(defaultName)
  const tags = flags.tag
    ? flags.tag
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [await promptValue('Runner tag', defaultTag)]
  const existing = await access(configPath)
    .then(() => loadRunnerConfig(configPath))
    .catch(() => undefined)
  const config: RunnerConfigFile = existing
    ? {
        ...existing,
        runners: [
          ...(existing.runners ?? []),
          {
            localKey: randomUUID(),
            token,
            displayName: name,
            tags,
            limit: 5,
          },
        ],
      }
    : {
        centerUrl,
        workspaceRoot: path.join(process.env.TMPDIR ?? '/tmp', 'tea-runner'),
        stateDir: path.join(
          process.env.XDG_STATE_HOME ?? path.join(process.env.HOME ?? '.', '.local', 'state'),
          'tea-runner',
        ),
        agents: defaultAcpRunnerAgents(),
        runners: [
          {
            localKey: randomUUID(),
            token,
            displayName: name,
            tags,
            limit: 5,
          },
        ],
      }
  await saveRunnerConfig(configPath, config)
  process.stdout.write(`runner configuration written to ${configPath}\n`)
  if (flags['install-service'] !== undefined) {
    installService(configPath)
    process.stdout.write('tea-runner service started\n')
    process.stdout.write(`tea-runner logs: ${runnerLogPath()}\n`)
    return
  }
  await run(configPath, false, 'foreground')
}

function defaultRunnerTag(machineName: string): string {
  const normalized = machineName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `tea-runner-${normalized || 'machine'}`.slice(0, 64)
}

async function run(
  configPath: string,
  force: boolean,
  mode: 'foreground' | 'service' = process.env.TEA_RUNNER_SERVICE === '1'
    ? 'service'
    : 'foreground',
): Promise<void> {
  const config = await loadRunnerConfig(configPath)
  const loggerHandle = await createRunnerLogger({ mode })
  const logger: RunnerLoggerHandle = loggerHandle
  const executor = new AcpAgentExecutor({ agents: config.agents })
  const runner = new TeaRunner(config, {
    executor,
    configPath,
    logger: logger.logger,
  })
  try {
    await runner.start()
  } catch (error) {
    logger.logger.error('runner failed to start', {
      error: error instanceof Error ? error.message : String(error),
    })
    logger.close()
    throw error
  }
  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    void runner
      .stop({ force })
      .catch((error: unknown) => {
        logger.logger.error('runner shutdown failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        logger.close()
        process.exit(0)
      })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

function installService(configPath: string): void {
  if (process.env.TEA_RUNNER_NO_SERVICE === '1') return
  const child = spawn(process.execPath, [process.argv[1]!, 'run', configPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, TEA_RUNNER_SERVICE: '1' },
  })
  child.unref()
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (!value?.startsWith('--')) continue
    const [key, inline] = value.slice(2).split('=', 2)
    if (inline !== undefined) flags[key!] = inline
    else if (args[index + 1] && !args[index + 1]!.startsWith('--')) flags[key!] = args[++index]!
    else flags[key!] = ''
  }
  return flags
}

async function promptValue(label: string, defaultValue: string): Promise<string> {
  const terminal = openPromptTerminal()
  if (!terminal) return defaultValue
  const readline = createInterface({ input: terminal.input, output: terminal.output })
  try {
    const answer = await readline.question(`${label}${defaultValue ? ` [${defaultValue}]` : ''}: `)
    return answer.trim() || defaultValue
  } finally {
    readline.close()
    terminal.close()
  }
}

interface PromptTerminal {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
  close(): void
}

function openPromptTerminal(): PromptTerminal | null {
  if (stdin.isTTY) return { input: stdin, output: stdout, close: () => undefined }
  if (!stderr.isTTY) return null
  const input = createReadStream(process.platform === 'win32' ? 'CONIN$' : '/dev/tty')
  return { input, output: stderr, close: () => input.destroy() }
}

async function readTokenFromStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8').trim()
}

void main().catch((error: unknown) => {
  process.stderr.write(`tea-runner: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
