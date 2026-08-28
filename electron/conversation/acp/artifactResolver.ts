/* eslint-disable security/detect-non-literal-fs-filename -- package paths are realpath-checked and constrained below. */
import { createRequire } from 'node:module'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import type { AcpAgentDefinition, ResolvedAcpAgentArtifact } from './agentDefinition'
import { AcpHostError } from './errors'

export type PackageJsonResolver = (packageName: string) => string

const localRequire = createRequire(import.meta.url)

export class AcpAgentArtifactResolver {
  constructor(
    private readonly resolvePackageJson: PackageJsonResolver = (packageName) =>
      localRequire.resolve(`${packageName}/package.json`),
  ) {}

  async resolve(definition: AcpAgentDefinition): Promise<ResolvedAcpAgentArtifact> {
    let unresolvedPackageJson: string
    try {
      unresolvedPackageJson = this.resolvePackageJson(definition.artifact.packageName)
    } catch (error) {
      throw new AcpHostError(
        'artifactMissing',
        `ACP Agent package is not installed: ${definition.artifact.packageName}`,
        false,
        { cause: error },
      )
    }

    try {
      const packageJsonPath = await realpath(unresolvedPackageJson)
      const packageRoot = await realpath(path.dirname(packageJsonPath))
      const metadata = parsePackageMetadata(await readFile(packageJsonPath, 'utf8'))
      if (
        metadata.name !== definition.artifact.packageName ||
        metadata.version !== definition.artifact.version
      ) {
        throw new AcpHostError(
          'artifactInvalid',
          `ACP Agent package identity mismatch for ${definition.id}`,
        )
      }

      const entrypointPath = await realpath(path.resolve(packageRoot, definition.entrypoint))
      if (!isWithin(packageRoot, entrypointPath) || !(await stat(entrypointPath)).isFile()) {
        throw new AcpHostError(
          'artifactInvalid',
          `ACP Agent entrypoint is outside its package: ${definition.id}`,
        )
      }

      return {
        definition: structuredClone(definition),
        packageRoot,
        packageJsonPath,
        entrypointPath,
      }
    } catch (error) {
      if (error instanceof AcpHostError) throw error
      throw new AcpHostError(
        'artifactInvalid',
        `ACP Agent artifact cannot be verified: ${definition.id}`,
        false,
        { cause: error },
      )
    }
  }
}

function parsePackageMetadata(value: string): { name?: string; version?: string } {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('package metadata must be an object')
  }
  const metadata = parsed as Record<string, unknown>
  return {
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    version: typeof metadata.version === 'string' ? metadata.version : undefined,
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
