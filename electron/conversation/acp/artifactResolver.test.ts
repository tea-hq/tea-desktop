/* eslint-disable security/detect-non-literal-fs-filename -- tests operate only inside mkdtemp fixtures. */
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { officialAcpAgentDefinitions } from './agentCatalog'
import { AcpAgentArtifactResolver } from './artifactResolver'

describe('AcpAgentArtifactResolver', () => {
  it('resolves an exact package-owned entrypoint', async () => {
    const definition = officialAcpAgentDefinitions()[0]
    const root = await packageFixture(definition.artifact.packageName, definition.artifact.version)
    const resolvedRoot = await realpath(root)
    const resolver = new AcpAgentArtifactResolver(() => path.join(root, 'package.json'))

    await expect(resolver.resolve(definition)).resolves.toMatchObject({
      packageRoot: resolvedRoot,
      entrypointPath: path.join(resolvedRoot, 'dist', 'index.js'),
    })
  })

  it('resolves the installed official Agent packages', async () => {
    const resolver = new AcpAgentArtifactResolver()
    for (const definition of officialAcpAgentDefinitions()) {
      await expect(resolver.resolve(definition)).resolves.toMatchObject({
        definition: { id: definition.id },
      })
    }
  })

  it('rejects version mismatches and entrypoint path escapes', async () => {
    const definition = officialAcpAgentDefinitions()[0]
    const wrongVersion = await packageFixture(definition.artifact.packageName, '0.0.0')
    await expect(
      new AcpAgentArtifactResolver(() => path.join(wrongVersion, 'package.json')).resolve(
        definition,
      ),
    ).rejects.toMatchObject({ code: 'artifactInvalid' })

    const root = await packageFixture(definition.artifact.packageName, definition.artifact.version)
    const outside = path.join(path.dirname(root), 'outside.js')
    await writeFile(outside, '')
    await expect(
      new AcpAgentArtifactResolver(() => path.join(root, 'package.json')).resolve({
        ...definition,
        entrypoint: '../outside.js',
      }),
    ).rejects.toMatchObject({ code: 'artifactInvalid' })
  })
})

async function packageFixture(name: string, version: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tea-acp-artifact-'))
  await mkdir(path.join(root, 'dist'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name, version }))
  await writeFile(path.join(root, 'dist', 'index.js'), '')
  return root
}
