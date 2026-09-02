import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { defaultAcpRunnerAgents } from '../../../packages/runner/src/defaults'
import { loadRunnerConfig, saveRunnerConfig } from '../../../packages/runner/src/runner'

describe('TeaRunner configuration', () => {
  it('uses a fixed temporary workspace when no root is configured', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-config-'))
    const filePath = path.join(directory, 'runner.toml')
    await writeFile(
      filePath,
      'center_url = "https://center.test"\n\n[[runners]]\nlocal_key = "runner-a"\nname = "Runner A"\ntoken = "secret"\ntags = [" linux "]\n',
    )
    await chmod(filePath, 0o600)
    const config = await loadRunnerConfig(filePath)
    expect(config.workspaceRoot).toBe(path.join(os.tmpdir(), 'tea-runner'))
    expect(config.runners[0]?.tags).toEqual(['linux'])
    expect(config.agents).toEqual(defaultAcpRunnerAgents())
  })

  it('writes runner credentials with restrictive file mode and preserves tags', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-config-'))
    const filePath = path.join(directory, 'nested', 'runner.toml')
    await saveRunnerConfig(filePath, {
      centerUrl: 'https://center.test',
      workspaceRoot: '/tmp/tea-runner',
      runners: [
        {
          localKey: 'runner-a',
          token: 'secret',
          displayName: 'Runner A',
          tags: ['linux'],
        },
      ],
    })
    const value = parseToml(await readFile(filePath, 'utf8')) as {
      runners: Array<{ tags: string[] }>
      agents: Array<{ runtime_id: string; executable: string }>
    }
    expect(value.runners[0]?.tags).toEqual(['linux'])
    expect(value.agents).toEqual([
      {
        runtime_id: 'external.claude',
        executable: 'claude-agent-acp',
        model_config_id: 'model',
        mode_config_id: 'mode',
      },
      {
        runtime_id: 'external.codex',
        executable: 'codex-acp',
        model_config_id: 'model',
        mode_config_id: 'mode',
      },
    ])
    expect((await stat(filePath)).mode & 0o077).toBe(0)
  })

  it('rejects a runner config that is readable by other users', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-config-'))
    const filePath = path.join(directory, 'runner.toml')
    await writeFile(
      filePath,
      'center_url = "https://center.test"\n\n[[runners]]\nlocal_key = "runner-a"\nname = "Runner A"\ntoken = "secret"\ntags = ["linux"]\n',
      { mode: 0o644 },
    )
    await expect(loadRunnerConfig(filePath)).rejects.toThrow('other users')
  })

  it('rejects the removed JSON configuration format', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-config-'))
    const filePath = path.join(directory, 'runner.json')
    await writeFile(filePath, '{}', { mode: 0o600 })
    await expect(loadRunnerConfig(filePath)).rejects.toThrow('.toml')
  })

  it('preserves ACP agent definitions when writing server updates', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-runner-config-'))
    const filePath = path.join(directory, 'runner.toml')
    const agents = [
      { runtimeId: 'acp.fixture', executable: '/usr/bin/node', arguments: ['fixture.mjs'] },
    ]
    await saveRunnerConfig(filePath, {
      centerUrl: 'https://center.test',
      workspaceRoot: '/tmp/tea-runner',
      agents,
      runners: [
        { localKey: 'runner-a', token: 'secret', displayName: 'Runner A', tags: ['linux'] },
      ],
    })
    const encoded = parseToml(await readFile(filePath, 'utf8')) as {
      agents: Array<{ runtime_id: string; model_config_id?: string }>
    }
    expect(encoded.agents[0]?.runtime_id).toBe('acp.fixture')
    expect(encoded.agents[0]?.model_config_id).toBeUndefined()
    const value = await loadRunnerConfig(filePath)
    expect(value.agents).toEqual(agents)
  })
})
