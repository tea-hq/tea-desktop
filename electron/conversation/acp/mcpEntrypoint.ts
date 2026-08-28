import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type * as acpV1 from '@agentclientprotocol/sdk'
import type * as acpV2 from '@agentclientprotocol/sdk/experimental/v2'

import { ConversationRuntimeError } from '../runtime'

const MCP_SERVER_NAME = 'tea-host-tools'

export interface ResolvedAcpMcpEntrypoint {
  command: string
  relayEntrypoint: string
}

export interface AcpMcpEntrypointResolverOptions {
  command?: string
  relayEntrypoint?: string
  expectedDirectory?: string
}

export type AcpMcpServerConfiguration =
  { wireVersion: 1; server: acpV1.McpServer } | { wireVersion: 2; server: acpV2.McpServer }

export class AcpMcpEntrypointResolver {
  private readonly command: string
  private readonly relayEntrypoint: string
  private readonly expectedDirectory: string

  constructor(options: AcpMcpEntrypointResolverOptions = {}) {
    const defaultEntrypoint = fileURLToPath(new URL('./mcp-process.js', import.meta.url))
    this.command = options.command ?? process.execPath
    this.relayEntrypoint = options.relayEntrypoint ?? defaultEntrypoint
    this.expectedDirectory = options.expectedDirectory ?? path.dirname(defaultEntrypoint)
  }

  async resolve(): Promise<ResolvedAcpMcpEntrypoint> {
    requireAbsolutePath(this.command, 'ACP MCP command')
    requireAbsolutePath(this.relayEntrypoint, 'ACP MCP relay entrypoint')
    requireAbsolutePath(this.expectedDirectory, 'ACP MCP build directory')
    if (path.dirname(this.relayEntrypoint) !== path.resolve(this.expectedDirectory)) {
      throw invalidConfiguration('ACP MCP relay must be inside the Electron build directory')
    }
    const [commandStats, entrypointStats] = await Promise.all([
      checkedStat(this.command),
      checkedStat(this.relayEntrypoint),
    ])
    if (!commandStats.isFile() || !entrypointStats.isFile()) {
      throw invalidConfiguration('ACP MCP executable artifact is invalid')
    }
    return { command: this.command, relayEntrypoint: this.relayEntrypoint }
  }
}

export function createAcpMcpServerConfiguration(
  wireVersion: 1 | 2,
  entrypoint: ResolvedAcpMcpEntrypoint,
  credentialPath: string,
): AcpMcpServerConfiguration {
  requireAbsolutePath(entrypoint.command, 'ACP MCP command')
  requireAbsolutePath(entrypoint.relayEntrypoint, 'ACP MCP relay entrypoint')
  requireAbsolutePath(credentialPath, 'ACP MCP credential path')
  const common = {
    name: MCP_SERVER_NAME,
    command: entrypoint.command,
    args: [entrypoint.relayEntrypoint, credentialPath],
    env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
  }
  return wireVersion === 1
    ? { wireVersion: 1, server: common satisfies acpV1.McpServerStdio }
    : {
        wireVersion: 2,
        server: { type: 'stdio', ...common } satisfies acpV2.McpServerStdio & { type: 'stdio' },
      }
}

async function checkedStat(filePath: string) {
  try {
    // Paths are absolute host-owned build artifacts validated before this call.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return await stat(filePath)
  } catch (cause) {
    throw invalidConfiguration('ACP MCP executable artifact is unavailable', cause)
  }
}

function requireAbsolutePath(value: string, name: string): void {
  if (
    !path.isAbsolute(value) ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    throw invalidConfiguration(`${name} must be an absolute path`)
  }
}

function invalidConfiguration(message: string, cause?: unknown): ConversationRuntimeError {
  return new ConversationRuntimeError(
    'invalidConfiguration',
    message,
    false,
    cause === undefined ? undefined : { cause },
  )
}
