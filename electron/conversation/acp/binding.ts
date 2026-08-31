import path from 'node:path'

import type { HostToolDefinition } from '../../../src/features/conversation/contracts'
import {
  ConversationRuntimeError,
  parseRuntimeConversationBinding,
  type RuntimeConversationBinding,
  type RuntimeConversationSelection,
} from '../runtime'
import type { AcpAgentDefinition, AcpWireVersion } from './agentDefinition'

const BINDING_SCHEMA_VERSION = 1
const MAX_ID_CHARS = 512
const MAX_INTEGRITY_CHARS = 1024
const MAX_PATH_CHARS = 4096
const MAX_HOST_TOOLS = 128

export interface AcpBindingContext {
  definition: AcpAgentDefinition
  workspacePath: string
  hostTools: readonly HostToolDefinition[]
  /** Deletion only needs binding identity; it must not resolve HostTools. */
  validateHostTools?: boolean
}

export interface AcpConversationBinding extends RuntimeConversationBinding {
  implementation: {
    kind: 'acp'
    id: string
    revision: number
  }
  protocol: {
    name: 'acp'
    version: AcpWireVersion
  }
}

export function createAcpConversationBinding(
  context: AcpBindingContext,
  nativeSessionId: string,
  wireVersion: AcpWireVersion,
): AcpConversationBinding {
  const binding: AcpConversationBinding = {
    schemaVersion: BINDING_SCHEMA_VERSION,
    runtimeId: context.definition.runtimeId,
    nativeSessionId,
    implementation: {
      kind: 'acp',
      id: context.definition.id,
      revision: context.definition.revision,
    },
    protocol: { name: 'acp', version: wireVersion },
    artifact: {
      packageName: context.definition.artifact.packageName,
      version: context.definition.artifact.version,
      integrity: context.definition.artifact.integrity,
    },
    workspacePath: context.workspacePath,
    hostTools: context.hostTools.map(({ name, version }) => ({ name, version })),
  }
  return validateAcpConversationBinding(binding, context)
}

export function validateAcpConversationBinding(
  value: unknown,
  context: AcpBindingContext,
): AcpConversationBinding {
  value = parseRuntimeConversationBinding(value)
  if (!isRecord(value) || !hasExactKeys(value, ROOT_KEYS, OPTIONAL_ROOT_KEYS))
    throw invalidBinding()
  if (
    value.schemaVersion !== BINDING_SCHEMA_VERSION ||
    value.runtimeId !== context.definition.runtimeId ||
    !validText(value.runtimeId, MAX_ID_CHARS) ||
    !validText(value.nativeSessionId, MAX_ID_CHARS) ||
    value.workspacePath !== context.workspacePath ||
    !validAbsolutePath(value.workspacePath)
  ) {
    throw invalidBinding()
  }

  const implementation = value.implementation
  if (
    !isRecord(implementation) ||
    !hasExactKeys(implementation, IMPLEMENTATION_KEYS) ||
    implementation.kind !== 'acp' ||
    implementation.id !== context.definition.id ||
    implementation.revision !== context.definition.revision ||
    !validText(implementation.id, MAX_ID_CHARS) ||
    !Number.isInteger(implementation.revision) ||
    implementation.revision < 1
  ) {
    throw invalidBinding()
  }

  const protocol = value.protocol
  if (
    !isRecord(protocol) ||
    !hasExactKeys(protocol, PROTOCOL_KEYS) ||
    protocol.name !== 'acp' ||
    (protocol.version !== 1 && protocol.version !== 2) ||
    !context.definition.preferredWireVersions.includes(protocol.version)
  ) {
    throw invalidBinding()
  }

  const artifact = value.artifact
  if (
    !isRecord(artifact) ||
    !hasExactKeys(artifact, ARTIFACT_KEYS) ||
    artifact.packageName !== context.definition.artifact.packageName ||
    artifact.version !== context.definition.artifact.version ||
    artifact.integrity !== context.definition.artifact.integrity ||
    !validText(artifact.packageName, MAX_ID_CHARS) ||
    !validText(artifact.version, MAX_ID_CHARS) ||
    !validText(artifact.integrity, MAX_INTEGRITY_CHARS)
  ) {
    throw invalidBinding()
  }

  if (!Array.isArray(value.hostTools) || value.hostTools.length > MAX_HOST_TOOLS) {
    throw invalidBinding()
  }
  const validateHostTools = context.validateHostTools ?? true
  if (validateHostTools && value.hostTools.length !== context.hostTools.length) {
    throw invalidBinding()
  }
  const expectedTools = context.hostTools[Symbol.iterator]()
  const hostTools = value.hostTools.map((candidate) => {
    const expected = validateHostTools ? expectedTools.next().value : undefined
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, HOST_TOOL_KEYS) ||
      !validText(candidate.name, MAX_ID_CHARS) ||
      !validText(candidate.version, MAX_ID_CHARS)
    ) {
      throw invalidBinding()
    }
    if (
      validateHostTools &&
      (!expected || candidate.name !== expected.name || candidate.version !== expected.version)
    ) {
      throw invalidBinding()
    }
    return { name: candidate.name, version: candidate.version }
  })

  return {
    schemaVersion: 1,
    runtimeId: value.runtimeId,
    nativeSessionId: value.nativeSessionId,
    ...(value.selection
      ? { selection: structuredClone(value.selection as RuntimeConversationSelection) }
      : {}),
    implementation: {
      kind: 'acp',
      id: implementation.id as string,
      revision: implementation.revision as number,
    },
    protocol: { name: 'acp', version: protocol.version },
    artifact: {
      packageName: artifact.packageName as string,
      version: artifact.version as string,
      integrity: artifact.integrity as string,
    },
    workspacePath: value.workspacePath,
    hostTools,
  }
}

const ROOT_KEYS = [
  'schemaVersion',
  'runtimeId',
  'nativeSessionId',
  'implementation',
  'protocol',
  'artifact',
  'workspacePath',
  'hostTools',
] as const
const OPTIONAL_ROOT_KEYS = ['selection'] as const
const IMPLEMENTATION_KEYS = ['kind', 'id', 'revision'] as const
const PROTOCOL_KEYS = ['name', 'version'] as const
const ARTIFACT_KEYS = ['packageName', 'version', 'integrity'] as const
const HOST_TOOL_KEYS = ['name', 'version'] as const

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.length >= required.length &&
    keys.length <= required.length + optional.length &&
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  )
}

function validText(value: unknown, maxChars: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxChars &&
    value.trim().length > 0 &&
    !value.includes('\0') &&
    !value.includes('\r') &&
    !value.includes('\n')
  )
}

function validAbsolutePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PATH_CHARS &&
    !value.includes('\0') &&
    path.isAbsolute(value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidBinding(): ConversationRuntimeError {
  return new ConversationRuntimeError(
    'invalidConfiguration',
    'ACP conversation binding does not match the active runtime configuration',
  )
}
