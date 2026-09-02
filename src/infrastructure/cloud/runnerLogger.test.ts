import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createRunnerLogger,
  runnerCacheDirectory,
  runnerLogPath,
} from '../../../packages/runner/src/logger'

describe('Runner logging', () => {
  it('uses platform cache conventions and supports an explicit cache directory', () => {
    expect(runnerCacheDirectory({} as NodeJS.ProcessEnv, 'darwin', '/Users/tester')).toBe(
      '/Users/tester/Library/Caches/tea/runner',
    )
    expect(runnerCacheDirectory({} as NodeJS.ProcessEnv, 'linux', '/home/tester')).toBe(
      '/home/tester/.cache/tea/runner',
    )
    expect(
      runnerCacheDirectory(
        { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' } as unknown as NodeJS.ProcessEnv,
        'win32',
        '/home',
      ),
    ).toBe('C:\\Users\\tester\\AppData\\Local/tea/runner')
    expect(runnerLogPath({ cacheDirectory: '/tmp/tea-runner-cache' })).toBe(
      '/tmp/tea-runner-cache/runner.log',
    )
  })

  it('writes service logs to a private cache directory', async () => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-log-'))
    const handle = await createRunnerLogger({ mode: 'service', cacheDirectory })
    handle.logger.info('runner attached', { localKey: 'runner-a', runnerId: 'server-a' })
    handle.close()

    const logPath = path.join(cacheDirectory, 'runner.log')
    const record = JSON.parse(await readFile(logPath, 'utf8')) as {
      msg?: string
      localKey?: string
      runnerId?: string
    }
    expect(record.msg).toBe('runner attached')
    expect(record.localKey).toBe('runner-a')
    expect(record.runnerId).toBe('server-a')
    expect((await stat(cacheDirectory)).mode & 0o777).toBe(0o700)
    expect((await stat(logPath)).mode & 0o777).toBe(0o600)
  })
})
