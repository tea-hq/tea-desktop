import { randomUUID } from 'node:crypto'

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import type { JsonSchemaType, JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation'

import type {
  ConversationJson,
  HostToolCall,
  HostToolDefinition,
  HostToolFailureCode,
  HostToolResult,
} from '../../src/features/conversation/contracts'
import { ConversationRuntimeError } from './runtime'

const DEFAULT_CALL_TIMEOUT_MS = 60_000
const DEFAULT_MAX_PENDING_CALLS = 4
const DEFAULT_MAX_JSON_BYTES = 256 * 1024
const DEFAULT_MAX_JSON_DEPTH = 16
const DEFAULT_MAX_TOOL_DEFINITIONS = 128
const MAX_TOOL_NAME_CHARS = 128
const MAX_TOOL_VERSION_CHARS = 64
const MAX_TOOL_DESCRIPTION_CHARS = 4_096
const MAX_FAILURE_MESSAGE_CHARS = 1_024
const SETTLED_CALL_HISTORY = 256
const TOOL_NAME = /^[A-Za-z0-9_.-]+$/
const FAILURE_CODES = new Set<HostToolFailureCode>([
  'cancelled',
  'executionFailed',
  'invalidRequest',
  'limitExceeded',
  'timeout',
  'unavailable',
])

export type HostToolCallEmitter = (call: HostToolCall) => void

export interface ConversationHostToolHandler {
  handles(name: string): boolean
  execute(call: HostToolCall, signal: AbortSignal): Promise<HostToolResult>
}

export interface ConversationToolBrokerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface ConversationToolBrokerOptions {
  callTimeoutMs?: number
  maxPendingCalls?: number
  maxJsonBytes?: number
  maxJsonDepth?: number
  maxToolDefinitions?: number
  createCallId?: () => string
  scheduler?: ConversationToolBrokerScheduler
  mainHandler?: ConversationHostToolHandler
}

export interface ConversationToolCallOptions {
  signal?: AbortSignal
}

export interface ConversationToolScope {
  readonly conversationId: string
  readonly revision: number
  definitions(): HostToolDefinition[]
  call(
    name: string,
    argumentsValue: unknown,
    options?: ConversationToolCallOptions,
  ): Promise<HostToolResult>
}

interface CompiledToolDefinition {
  definition: HostToolDefinition
  validateInput: JsonSchemaValidator<Record<string, ConversationJson>>
  validateOutput: JsonSchemaValidator<Record<string, ConversationJson>>
}

interface ConfiguredToolScope {
  revision: number
  definitions: Map<string, CompiledToolDefinition>
}

interface PendingToolCall {
  conversationId: string
  revision: number
  tool: CompiledToolDefinition
  timer: unknown
  signal?: AbortSignal
  onAbort?: () => void
  resolve: (result: HostToolResult) => void
  abortExecution?: () => void
}

const DEFAULT_SCHEDULER: ConversationToolBrokerScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class ConversationToolBroker {
  private readonly scopes = new Map<string, ConfiguredToolScope>()
  private readonly pending = new Map<string, PendingToolCall>()
  private readonly settledOwners = new Map<string, string>()
  private readonly validator = new AjvJsonSchemaValidator()
  private readonly scheduler: ConversationToolBrokerScheduler
  private readonly createCallId: () => string
  private readonly callTimeoutMs: number
  private readonly maxPendingCalls: number
  private readonly maxJsonBytes: number
  private readonly maxJsonDepth: number
  private readonly maxToolDefinitions: number
  private readonly mainHandler?: ConversationHostToolHandler
  private nextRevision = 1
  private shutDown = false

  constructor(
    private readonly emitCall: HostToolCallEmitter,
    options: ConversationToolBrokerOptions = {},
  ) {
    this.callTimeoutMs = positiveInteger(
      options.callTimeoutMs,
      DEFAULT_CALL_TIMEOUT_MS,
      'HostTool timeout',
    )
    this.maxPendingCalls = positiveInteger(
      options.maxPendingCalls,
      DEFAULT_MAX_PENDING_CALLS,
      'HostTool pending-call limit',
    )
    this.maxJsonBytes = positiveInteger(
      options.maxJsonBytes,
      DEFAULT_MAX_JSON_BYTES,
      'HostTool JSON byte limit',
    )
    this.maxJsonDepth = positiveInteger(
      options.maxJsonDepth,
      DEFAULT_MAX_JSON_DEPTH,
      'HostTool JSON depth limit',
    )
    this.maxToolDefinitions = positiveInteger(
      options.maxToolDefinitions,
      DEFAULT_MAX_TOOL_DEFINITIONS,
      'HostTool definition limit',
    )
    this.createCallId = options.createCallId ?? randomUUID
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER
    this.mainHandler = options.mainHandler
  }

  configureConversation(conversationId: string, definitions: HostToolDefinition[]): void {
    this.assertActive()
    requireIdentifier(conversationId, 'conversation id')
    if (definitions.length > this.maxToolDefinitions) {
      throw new ConversationRuntimeError(
        'invalidConfiguration',
        `HostTool definition count exceeds ${this.maxToolDefinitions}`,
      )
    }

    const compiled = new Map<string, CompiledToolDefinition>()
    for (const source of definitions) {
      const definition = this.validateDefinition(source)
      if (compiled.has(definition.name)) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          `duplicate HostTool definition: ${definition.name}`,
        )
      }
      try {
        compiled.set(definition.name, {
          definition,
          validateInput: this.validator.getValidator(
            definition.inputSchema as unknown as JsonSchemaType,
          ),
          validateOutput: this.validator.getValidator(
            definition.outputSchema as unknown as JsonSchemaType,
          ),
        })
      } catch (cause) {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          `HostTool JSON schema is invalid: ${definition.name}`,
          false,
          { cause },
        )
      }
    }

    this.cancelPending(conversationId, 'unavailable')
    this.scopes.set(conversationId, {
      revision: this.nextRevision++,
      definitions: compiled,
    })
  }

  openScope(conversationId: string): ConversationToolScope {
    this.assertActive()
    const configured = this.requireConfiguredScope(conversationId)
    const revision = configured.revision
    const definitions = [...configured.definitions.values()].map(({ definition }) =>
      structuredClone(definition),
    )
    return {
      conversationId,
      revision,
      definitions: () => structuredClone(definitions),
      call: (name, argumentsValue, options) =>
        this.call(conversationId, revision, name, argumentsValue, options),
    }
  }

  resolve(result: HostToolResult): void {
    this.assertActive()
    requireIdentifier(result.conversationId, 'conversation id')
    requireIdentifier(result.callId, 'HostTool call id')
    const pending = this.pending.get(result.callId)
    if (!pending) {
      const owner = this.settledOwners.get(result.callId)
      if (owner) {
        throw new ConversationRuntimeError(
          'invalidState',
          owner === result.conversationId
            ? `HostTool call was already resolved: ${result.callId}`
            : `HostTool result belongs to another conversation: ${result.callId}`,
        )
      }
      throw new ConversationRuntimeError(
        'invalidState',
        `HostTool call is not pending: ${result.callId}`,
      )
    }
    if (pending.conversationId !== result.conversationId) {
      throw new ConversationRuntimeError(
        'invalidState',
        `HostTool result belongs to another conversation: ${result.callId}`,
      )
    }

    this.settle(result.callId, this.validateResult(result, pending.tool))
  }

  cancelConversation(conversationId: string): void {
    this.assertActive()
    this.requireConfiguredScope(conversationId)
    this.cancelPending(conversationId, 'cancelled')
  }

  removeConversation(conversationId: string): void {
    this.assertActive()
    this.requireConfiguredScope(conversationId)
    this.cancelPending(conversationId, 'unavailable')
    this.scopes.delete(conversationId)
  }

  shutdown(): void {
    if (this.shutDown) return
    this.shutDown = true
    for (const conversationId of this.scopes.keys()) {
      this.cancelPending(conversationId, 'cancelled')
    }
    this.scopes.clear()
    this.settledOwners.clear()
  }

  private async call(
    conversationId: string,
    revision: number,
    name: string,
    argumentsValue: unknown,
    options: ConversationToolCallOptions = {},
  ): Promise<HostToolResult> {
    this.assertActive()
    const callId = this.allocateCallId()
    const scope = this.scopes.get(conversationId)
    if (!scope || scope.revision !== revision) {
      return this.immediateFailure(conversationId, callId, 'unavailable')
    }
    const tool = scope.definitions.get(name)
    if (!tool) return this.immediateFailure(conversationId, callId, 'unavailable')
    if (!isRecord(argumentsValue)) {
      return this.immediateFailure(conversationId, callId, 'invalidRequest')
    }
    const argumentBounds = inspectJson(argumentsValue, this.maxJsonBytes, this.maxJsonDepth)
    if (argumentBounds !== 'valid') {
      return this.immediateFailure(
        conversationId,
        callId,
        argumentBounds === 'invalid' ? 'invalidRequest' : 'limitExceeded',
      )
    }
    if (!tool.validateInput(argumentsValue).valid) {
      return this.immediateFailure(conversationId, callId, 'invalidRequest')
    }
    if (options.signal?.aborted) {
      return this.immediateFailure(conversationId, callId, 'cancelled')
    }
    if (this.pending.size >= this.maxPendingCalls) {
      return this.immediateFailure(conversationId, callId, 'limitExceeded')
    }

    const result = new Promise<HostToolResult>((resolve) => {
      const timer = this.scheduler.setTimeout(
        () => this.settleFailure(callId, 'timeout'),
        this.callTimeoutMs,
      )
      const pending: PendingToolCall = {
        conversationId,
        revision,
        tool,
        timer,
        resolve,
      }
      if (options.signal) {
        const onAbort = () => this.settleFailure(callId, 'cancelled')
        pending.signal = options.signal
        pending.onAbort = onAbort
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
      this.pending.set(callId, pending)
    })

    const call: HostToolCall = {
      conversationId,
      callId,
      name,
      arguments: structuredClone(argumentsValue),
    }
    try {
      if (this.mainHandler?.handles(name)) {
        const controller = new AbortController()
        const pending = this.pending.get(callId)
        if (pending) pending.abortExecution = () => controller.abort()
        void this.mainHandler.execute(call, controller.signal).then(
          (handled) => {
            if (!this.pending.has(callId)) return
            try {
              this.resolve(handled)
            } catch {
              this.settleFailure(callId, 'executionFailed')
            }
          },
          () => this.settleFailure(callId, 'executionFailed'),
        )
      } else {
        this.emitCall(call)
      }
    } catch {
      this.settleFailure(callId, 'executionFailed')
    }
    return result
  }

  private validateDefinition(source: HostToolDefinition): HostToolDefinition {
    if (
      !isRecord(source) ||
      typeof source.name !== 'string' ||
      typeof source.version !== 'string' ||
      typeof source.description !== 'string' ||
      !TOOL_NAME.test(source.name) ||
      source.name.length > MAX_TOOL_NAME_CHARS ||
      !source.version.trim() ||
      source.version.length > MAX_TOOL_VERSION_CHARS ||
      !source.description.trim() ||
      (source.iconUrl !== undefined && !validIconURL(source.iconUrl)) ||
      source.description.length > MAX_TOOL_DESCRIPTION_CHARS
    ) {
      throw new ConversationRuntimeError('invalidConfiguration', 'HostTool metadata is invalid')
    }
    for (const [kind, schema] of [
      ['input', source.inputSchema],
      ['output', source.outputSchema],
    ] as const) {
      if (!isRecord(schema) || schema.type !== 'object') {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          `HostTool ${kind} schema must describe an object: ${source.name}`,
        )
      }
      if (inspectJson(schema, this.maxJsonBytes, this.maxJsonDepth) !== 'valid') {
        throw new ConversationRuntimeError(
          'invalidConfiguration',
          `HostTool ${kind} schema exceeds its bounds: ${source.name}`,
        )
      }
    }
    return structuredClone(source)
  }

  private validateResult(result: HostToolResult, tool: CompiledToolDefinition): HostToolResult {
    if (result.status === 'success') {
      if (!isRecord(result.output)) return failureFrom(result, 'executionFailed')
      const bounds = inspectJson(result.output, this.maxJsonBytes, this.maxJsonDepth)
      if (bounds !== 'valid') {
        return failureFrom(result, bounds === 'invalid' ? 'executionFailed' : 'limitExceeded')
      }
      if (!tool.validateOutput(result.output).valid) {
        return failureFrom(result, 'executionFailed')
      }
      return structuredClone(result)
    }
    if (!FAILURE_CODES.has(result.code)) return failureFrom(result, 'executionFailed')
    if (
      result.message !== undefined &&
      (typeof result.message !== 'string' || result.message.length > MAX_FAILURE_MESSAGE_CHARS)
    ) {
      return failureFrom(result, 'limitExceeded')
    }
    return structuredClone(result)
  }

  private settleFailure(callId: string, code: HostToolFailureCode, message?: string): void {
    const pending = this.pending.get(callId)
    if (!pending) return
    pending.abortExecution?.()
    this.settle(callId, {
      conversationId: pending.conversationId,
      callId,
      status: 'failure',
      code,
      ...(message ? { message: message.slice(0, MAX_FAILURE_MESSAGE_CHARS) } : {}),
    })
  }

  private settle(callId: string, result: HostToolResult): void {
    const pending = this.pending.get(callId)
    if (!pending) return
    this.pending.delete(callId)
    this.scheduler.clearTimeout(pending.timer)
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    this.rememberSettled(callId, pending.conversationId)
    pending.resolve(structuredClone(result))
  }

  private cancelPending(conversationId: string, code: HostToolFailureCode): void {
    for (const [callId, pending] of this.pending) {
      if (pending.conversationId === conversationId) this.settleFailure(callId, code)
    }
  }

  private immediateFailure(
    conversationId: string,
    callId: string,
    code: HostToolFailureCode,
  ): HostToolResult {
    this.rememberSettled(callId, conversationId)
    return { conversationId, callId, status: 'failure', code }
  }

  private allocateCallId(): string {
    const callId = this.createCallId().trim()
    if (!callId || this.pending.has(callId) || this.settledOwners.has(callId)) {
      throw new ConversationRuntimeError(
        'invalidState',
        'HostTool call id generator repeated an id',
      )
    }
    return callId
  }

  private rememberSettled(callId: string, conversationId: string): void {
    this.settledOwners.set(callId, conversationId)
    while (this.settledOwners.size > SETTLED_CALL_HISTORY) {
      const oldest = this.settledOwners.keys().next().value
      if (oldest === undefined) break
      this.settledOwners.delete(oldest)
    }
  }

  private requireConfiguredScope(conversationId: string): ConfiguredToolScope {
    requireIdentifier(conversationId, 'conversation id')
    const scope = this.scopes.get(conversationId)
    if (!scope) {
      throw new ConversationRuntimeError(
        'unknownConversation',
        `HostTool scope is not configured: ${conversationId}`,
      )
    }
    return scope
  }

  private assertActive(): void {
    if (this.shutDown) {
      throw new ConversationRuntimeError('shutDown', 'ConversationToolBroker has shut down')
    }
  }
}

function validIconURL(value: string): boolean {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2_048 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return false
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

function failureFrom(
  result: Pick<HostToolResult, 'conversationId' | 'callId'>,
  code: HostToolFailureCode,
): HostToolResult {
  return {
    conversationId: result.conversationId,
    callId: result.callId,
    status: 'failure',
    code,
  }
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new ConversationRuntimeError('invalidConfiguration', `${name} must be a positive integer`)
  }
  return resolved
}

function requireIdentifier(value: string, name: string): void {
  if (!value.trim() || value.length > 512 || value.includes('\0')) {
    throw new ConversationRuntimeError('invalidState', `${name} is invalid`)
  }
}

function isRecord(value: unknown): value is Record<string, ConversationJson> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

type JsonInspection = 'valid' | 'invalid' | 'depthExceeded' | 'sizeExceeded'

function inspectJson(value: unknown, maxBytes: number, maxDepth: number): JsonInspection {
  const ancestors = new Set<object>()
  let bytes = 0

  const addBytes = (amount: number): boolean => {
    bytes += amount
    return bytes <= maxBytes
  }
  const visit = (current: unknown, depth: number): JsonInspection => {
    if (depth > maxDepth) return 'depthExceeded'
    if (current === null) return addBytes(4) ? 'valid' : 'sizeExceeded'
    if (typeof current === 'boolean') return addBytes(current ? 4 : 5) ? 'valid' : 'sizeExceeded'
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return 'invalid'
      return addBytes(String(current).length) ? 'valid' : 'sizeExceeded'
    }
    if (typeof current === 'string') {
      if (Buffer.byteLength(current, 'utf8') > maxBytes) return 'sizeExceeded'
      return addBytes(Buffer.byteLength(JSON.stringify(current), 'utf8')) ? 'valid' : 'sizeExceeded'
    }
    if (typeof current !== 'object' || current === undefined) return 'invalid'
    if (!Array.isArray(current) && !isRecord(current)) return 'invalid'
    if (ancestors.has(current)) return 'invalid'
    ancestors.add(current)
    const array = Array.isArray(current)
    if (!addBytes(2)) return 'sizeExceeded'
    const entries = array
      ? Array.from(current, (item, index) => [String(index), item] as const)
      : Object.entries(current)
    if (
      Reflect.ownKeys(current).some((key) => {
        if (typeof key !== 'string') return true
        if (!array) return !Object.prototype.propertyIsEnumerable.call(current, key)
        if (key === 'length') return false
        const index = Number(key)
        return (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= current.length ||
          String(index) !== key
        )
      }) ||
      (array && entries.some((_, index) => !(index in current)))
    ) {
      return 'invalid'
    }
    let first = true
    for (const [key, item] of entries) {
      if (!first && !addBytes(1)) return 'sizeExceeded'
      first = false
      if (!array) {
        if (Buffer.byteLength(key, 'utf8') > maxBytes) return 'sizeExceeded'
        if (!addBytes(Buffer.byteLength(JSON.stringify(key), 'utf8') + 1)) return 'sizeExceeded'
      }
      const inspection = visit(item, depth + 1)
      if (inspection !== 'valid') return inspection
    }
    ancestors.delete(current)
    return 'valid'
  }

  try {
    return visit(value, 1)
  } catch {
    return 'invalid'
  }
}
