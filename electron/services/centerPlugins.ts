import { createHash } from 'node:crypto'

import type { CenterAuthState } from '../../src/features/auth/contracts'
import type {
  ConversationJson,
  HostToolCall,
  HostToolDefinition,
  HostToolFailureCode,
  HostToolResult,
} from '../../src/features/conversation/contracts'
import type { ConversationHostToolHandler } from '../conversation/toolBroker'
import type { ElectronCenterAuthService } from './centerAuth'

const TOOL_VERSION = '1'
const MAX_PLUGINS = 64
const MAX_TOOLS = 127
const MAX_TEXT = 4_096
const MAX_ICON_URL = 2_048
const IDENTIFIER = /^[A-Za-z0-9._-]{1,256}$/

interface CenterPluginClient {
  stateValue(): CenterAuthState
  listEnabledPlugins(signal?: AbortSignal): Promise<unknown>
  callPlugin(
    pluginId: string,
    operationId: string,
    argumentsValue: Record<string, unknown>,
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<unknown>
}

interface PluginOperation {
  id: string
  name: string
  description: string
  method: string
  path: string
  parameters: PluginParameter[]
  bodySchema?: Record<string, ConversationJson>
}

interface PluginParameter {
  name: string
  in: 'path' | 'query' | 'header'
  required: boolean
  schema?: Record<string, ConversationJson>
}

interface PluginTool {
  pluginId: string
  operationId: string
  definition: HostToolDefinition
}

export class ElectronCenterPluginService implements ConversationHostToolHandler {
  private tools = new Map<string, PluginTool>()
  private tenantId: string | null = null
  private generation = 0
  private refreshPromise: Promise<void> | null = null

  constructor(private readonly center: CenterPluginClient | ElectronCenterAuthService) {}

  synchronize(state: CenterAuthState = this.center.stateValue()): Promise<void> {
    const tenantId = state.bootstrap?.tenant.id ?? null
    if (state.phase !== 'authenticated' || !tenantId) {
      this.clear()
      return Promise.resolve()
    }
    if (this.tenantId !== tenantId) {
      this.clear()
      this.tenantId = tenantId
    }
    if (this.refreshPromise) return this.refreshPromise
    const generation = ++this.generation
    const refresh = this.refresh(generation, tenantId)
    this.refreshPromise = refresh
    void refresh.then(
      () => {
        if (this.refreshPromise === refresh) this.refreshPromise = null
      },
      () => {
        if (this.refreshPromise === refresh) this.refreshPromise = null
      },
    )
    return refresh
  }

  async mandatoryDefinitions(): Promise<HostToolDefinition[]> {
    await this.refreshPromise
    return [...this.tools.values()].map(({ definition }) => structuredClone(definition))
  }

  handles(name: string): boolean {
    return this.tools.has(name)
  }

  async execute(call: HostToolCall, signal: AbortSignal): Promise<HostToolResult> {
    const tool = this.tools.get(call.name)
    if (!tool || !this.tenantId) return failure(call, 'unavailable')
    try {
      const response = await this.center.callPlugin(
        tool.pluginId,
        tool.operationId,
        structuredClone(call.arguments),
        call.conversationId,
        signal,
      )
      const output = parsePluginCallResponse(response, tool)
      return { conversationId: call.conversationId, callId: call.callId, status: 'success', output }
    } catch (error) {
      return failure(call, pluginFailureCode(error))
    }
  }

  private async refresh(generation: number, tenantId: string): Promise<void> {
    try {
      const response = await this.center.listEnabledPlugins()
      const tools = parsePluginCatalog(response)
      if (generation !== this.generation || this.tenantId !== tenantId) return
      this.tools = tools
    } catch (error) {
      if (generation === this.generation && this.tenantId === tenantId) this.tools.clear()
      throw error
    }
  }

  private clear(): void {
    this.generation += 1
    this.tenantId = null
    this.tools.clear()
    this.refreshPromise = null
  }
}

function parsePluginCatalog(value: unknown): Map<string, PluginTool> {
  if (!Array.isArray(value) || value.length > MAX_PLUGINS) throw new Error('invalid plugin catalog')
  const tools = new Map<string, PluginTool>()
  for (const pluginValue of value) {
    if (!isRecord(pluginValue) || pluginValue.enabled !== true) throw new Error('invalid plugin')
    const pluginId = requiredIdentifier(pluginValue.pluginId)
    const displayName = requiredText(pluginValue.displayName)
    const pluginDescription = optionalText(pluginValue.description)
    const iconUrl = optionalIconURL(pluginValue.iconUrl)
    if (!Array.isArray(pluginValue.operations)) throw new Error('invalid plugin operations')
    for (const operationValue of pluginValue.operations) {
      const operation = parseOperation(operationValue)
      const name = toolName(pluginId, operation.id, displayName, operation.name)
      if (tools.has(name) || tools.size >= MAX_TOOLS) throw new Error('plugin tool limit exceeded')
      const description = [
        `${displayName}: ${operation.description || operation.name}`,
        pluginDescription,
        `HTTP ${operation.method} ${operation.path}`,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_TEXT)
      tools.set(name, {
        pluginId,
        operationId: operation.id,
        definition: {
          name,
          version: TOOL_VERSION,
          description,
          ...(iconUrl ? { iconUrl } : {}),
          inputSchema: inputSchema(operation),
          outputSchema: pluginOutputSchema(),
        },
      })
    }
  }
  return tools
}

function parseOperation(value: unknown): PluginOperation {
  if (!isRecord(value)) throw new Error('invalid plugin operation')
  const id = requiredIdentifier(value.id)
  const name = requiredText(value.name)
  const description = optionalText(value.description)
  const method = requiredText(value.method)
  const path = requiredText(value.path)
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !path.startsWith('/'))
    throw new Error('invalid plugin operation')
  const parameterValues = value.parameters ?? []
  if (!Array.isArray(parameterValues)) throw new Error('invalid plugin parameters')
  const parameters = parameterValues.map(parseParameter)
  if (new Set(parameters.map(({ name }) => name)).size !== parameters.length)
    throw new Error('duplicate plugin parameter')
  const bodySchema = normalizeSchema(value.bodySchema)
  if (bodySchema && parameters.some(({ name }) => name === 'body'))
    throw new Error('reserved plugin parameter')
  return { id, name, description, method, path, parameters, ...(bodySchema ? { bodySchema } : {}) }
}

function parseParameter(value: unknown): PluginParameter {
  if (!isRecord(value)) throw new Error('invalid plugin parameter')
  const name = requiredText(value.name)
  const location = value.in
  if (location !== 'path' && location !== 'query' && location !== 'header')
    throw new Error('invalid plugin parameter')
  const schema = normalizeSchema(value.schema)
  return { name, in: location, required: value.required === true, ...(schema ? { schema } : {}) }
}

function inputSchema(operation: PluginOperation): HostToolDefinition['inputSchema'] {
  const properties = Object.create(null) as Record<string, ConversationJson>
  const required: string[] = []
  for (const parameter of operation.parameters) {
    properties[parameter.name] = parameter.schema ?? {}
    if (parameter.required) required.push(parameter.name)
  }
  if (operation.bodySchema) properties.body = operation.bodySchema
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function pluginOutputSchema(): HostToolDefinition['outputSchema'] {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      requestId: { type: 'string' },
      pluginId: { type: 'string' },
      operationId: { type: 'string' },
      statusCode: { type: 'integer' },
      contentType: { type: 'string' },
      body: {},
    },
    required: ['requestId', 'pluginId', 'operationId', 'statusCode', 'contentType', 'body'],
  }
}

function parsePluginCallResponse(
  value: unknown,
  tool: PluginTool,
): Record<string, ConversationJson> {
  if (!isRecord(value)) throw new Error('invalid plugin response')
  const requestId = requiredIdentifier(value.requestId)
  if (value.pluginId !== tool.pluginId || value.operationId !== tool.operationId)
    throw new Error('mismatched plugin response')
  if (
    !Number.isInteger(value.statusCode) ||
    (value.statusCode as number) < 100 ||
    (value.statusCode as number) > 599
  )
    throw new Error('invalid plugin response')
  const contentType = typeof value.contentType === 'string' ? value.contentType.slice(0, 512) : ''
  const bodyValue =
    value.body !== undefined ? value.body : value.bodyText !== undefined ? value.bodyText : null
  if (!isConversationJson(bodyValue)) throw new Error('invalid plugin response body')
  return {
    requestId,
    pluginId: tool.pluginId,
    operationId: tool.operationId,
    statusCode: value.statusCode as number,
    contentType,
    body: structuredClone(bodyValue),
  }
}

function normalizeSchema(value: unknown): Record<string, ConversationJson> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value) || !isConversationJson(value)) throw new Error('invalid plugin schema')
  return stripReferences(value) as Record<string, ConversationJson>
}

function stripReferences(value: ConversationJson): ConversationJson {
  if (Array.isArray(value)) return value.map(stripReferences)
  if (!isRecord(value)) return value
  if (typeof value.$ref === 'string') return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, stripReferences(item)]),
  )
}

function toolName(
  pluginId: string,
  operationId: string,
  pluginName: string,
  operationName: string,
): string {
  const digest = createHash('sha256')
    .update(`${pluginId}\0${operationId}`)
    .digest('hex')
    .slice(0, 16)
  const label = slug(`${pluginName}_${operationName}`).slice(0, 80)
  return `tea_plugin_${label || 'operation'}_${digest}`
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function requiredIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error('invalid identifier')
  return value
}

function requiredText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > MAX_TEXT ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error('invalid text')
  return value
}

function optionalText(value: unknown): string {
  if (value === undefined || value === '') return ''
  return requiredText(value)
}

function optionalIconURL(value: unknown): string {
  if (value === undefined || value === '') return ''
  if (
    typeof value !== 'string' ||
    value.length > MAX_ICON_URL ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error('invalid icon URL')
  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password
    )
      throw new Error('invalid icon URL')
  } catch {
    throw new Error('invalid icon URL')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, ConversationJson> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isConversationJson(value: unknown, depth = 0): value is ConversationJson {
  if (depth > 24) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every((item) => isConversationJson(item, depth + 1))
  return (
    isRecord(value) && Object.values(value).every((item) => isConversationJson(item, depth + 1))
  )
}

function pluginFailureCode(error: unknown): HostToolFailureCode {
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
  return code === 'centerUnavailable' || code === 'recoveryRequired'
    ? 'unavailable'
    : 'executionFailed'
}

function failure(call: HostToolCall, code: HostToolFailureCode): HostToolResult {
  return { conversationId: call.conversationId, callId: call.callId, status: 'failure', code }
}
