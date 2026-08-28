/* eslint-disable security/detect-non-literal-fs-filename -- Tests operate only on fresh temporary directories. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { AcpMcpEntrypointResolver, createAcpMcpServerConfiguration } from './mcpEntrypoint'

describe('ACP MCP relay entrypoint', () => {
  it('resolves only an existing relay inside the expected build directory', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tea-mcp-entrypoint-test-'))
    const relayEntrypoint = path.join(directory, 'mcp-process.js')
    await writeFile(relayEntrypoint, 'process.exit(0)')
    const resolver = new AcpMcpEntrypointResolver({
      command: process.execPath,
      relayEntrypoint,
      expectedDirectory: directory,
    })

    await expect(resolver.resolve()).resolves.toEqual({
      command: process.execPath,
      relayEntrypoint,
    })
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects a missing or out-of-directory relay', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tea-mcp-entrypoint-test-'))
    await expect(
      new AcpMcpEntrypointResolver({
        command: process.execPath,
        relayEntrypoint: path.join(directory, 'missing.js'),
        expectedDirectory: directory,
      }).resolve(),
    ).rejects.toMatchObject({ code: 'invalidConfiguration' })
    await expect(
      new AcpMcpEntrypointResolver({
        command: process.execPath,
        relayEntrypoint: path.join(path.dirname(directory), 'outside.js'),
        expectedDirectory: directory,
      }).resolve(),
    ).rejects.toMatchObject({ code: 'invalidConfiguration' })
    await rm(directory, { recursive: true, force: true })
  })

  it('creates exact standard ACP V1 and V2 stdio configurations', () => {
    const entrypoint = {
      command: '/Applications/Tea.app/Contents/MacOS/Tea',
      relayEntrypoint: '/Applications/Tea.app/Contents/Resources/app/dist-electron/mcp-process.js',
    }
    const credentialPath = '/private/tmp/tea-mcp/attachment.json'

    expect(createAcpMcpServerConfiguration(1, entrypoint, credentialPath)).toEqual({
      wireVersion: 1,
      server: {
        name: 'tea-host-tools',
        command: entrypoint.command,
        args: [entrypoint.relayEntrypoint, credentialPath],
        env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
      },
    })
    expect(createAcpMcpServerConfiguration(2, entrypoint, credentialPath)).toEqual({
      wireVersion: 2,
      server: {
        type: 'stdio',
        name: 'tea-host-tools',
        command: entrypoint.command,
        args: [entrypoint.relayEntrypoint, credentialPath],
        env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
      },
    })
    const serialized = JSON.stringify([
      createAcpMcpServerConfiguration(1, entrypoint, credentialPath),
      createAcpMcpServerConfiguration(2, entrypoint, credentialPath),
    ])
    expect(serialized).not.toContain('endpoint')
    expect(serialized).not.toContain('capability')
  })

  it('rejects relative configuration paths', () => {
    expect(() =>
      createAcpMcpServerConfiguration(
        1,
        { command: 'electron', relayEntrypoint: '/app/mcp-process.js' },
        '/tmp/attachment.json',
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalidConfiguration' }))
  })
})
