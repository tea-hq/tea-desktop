import type { SendMessageOptions } from '../../../src/features/conversation/contracts'
import { ConversationRuntimeError } from '../runtime'
import type { AcpSessionConfigurationDefinition, AcpWireVersion } from './agentDefinition'

const MAX_CONFIG_OPTIONS = 64
const MAX_CONFIG_VALUES = 256
const MAX_CONFIG_ID_CHARS = 256

interface SelectOptionState {
  id: string
  category?: string
  currentValue: string
  values: Set<string>
}

interface ModeState {
  currentModeId: string
  availableModeIds: Set<string>
}

export interface AcpSessionConfigurationRequests {
  setMode(modeId: string): Promise<void>
  setConfigOption(configId: string, value: string): Promise<{ configOptions?: unknown } | void>
}

export class AcpSessionConfiguration {
  private readonly options = new Map<string, SelectOptionState>()
  private modes: ModeState | null = null

  constructor(
    private readonly definition: AcpSessionConfigurationDefinition,
    private readonly wireVersion: AcpWireVersion,
  ) {}

  acceptSessionResponse(response: unknown): void {
    if (!isRecord(response)) throw invalidConfiguration('ACP session response is invalid')
    if (response.modes !== undefined && response.modes !== null) {
      this.modes = parseModes(response.modes)
    }
    if (response.configOptions !== undefined && response.configOptions !== null) {
      this.replaceConfigOptions(response.configOptions)
    }
  }

  acceptSessionUpdate(update: unknown): void {
    if (!isRecord(update) || typeof update.sessionUpdate !== 'string') return
    if (update.sessionUpdate === 'current_mode_update') {
      const modeId = requireIdentifier(update.currentModeId, 'ACP current mode')
      if (!this.availableModeIds().has(modeId)) {
        throw invalidConfiguration(`ACP Agent selected an unadvertised mode: ${modeId}`)
      }
      this.setCurrentMode(modeId)
      return
    }
    if (update.sessionUpdate === 'config_option_update') {
      this.replaceConfigOptions(update.configOptions)
    }
  }

  apply(
    options: Pick<SendMessageOptions, 'model' | 'permissionMode'>,
    requests: AcpSessionConfigurationRequests,
  ): Promise<void> | undefined {
    const requestedModel =
      options.model === 'default' ? this.definition.defaultModelId : options.model
    if (requestedModel !== undefined) {
      const model = this.requireSelectOption(this.definition.modelConfigId, 'model')
      if (!model.values.has(requestedModel)) {
        throw invalidConfiguration(`ACP model is not advertised: ${requestedModel}`)
      }
      if (model.currentValue !== requestedModel) {
        return requests.setConfigOption(model.id, requestedModel).then((response) => {
          if (response?.configOptions !== undefined) {
            this.replaceConfigOptions(response.configOptions)
          } else {
            model.currentValue = requestedModel
          }
          return this.applyMode(options.permissionMode, requests)
        })
      }
    }

    return this.applyMode(options.permissionMode, requests)
  }

  private applyMode(
    permissionMode: SendMessageOptions['permissionMode'],
    requests: AcpSessionConfigurationRequests,
  ): Promise<void> | undefined {
    const modeId =
      permissionMode === 'readOnly'
        ? this.definition.permissionModeIds.readOnly
        : permissionMode === 'fullAccess'
          ? this.definition.permissionModeIds.fullAccess
          : this.definition.permissionModeIds.default
    if (!this.availableModeIds().has(modeId)) {
      throw invalidConfiguration(
        `ACP permission mode is not advertised for ${permissionMode}: ${modeId}`,
      )
    }
    if (this.currentModeId() === modeId) return undefined

    if (this.wireVersion === 1 && this.modes) {
      return requests.setMode(modeId).then(() => this.setCurrentMode(modeId))
    }

    const mode = this.requireSelectOption(this.definition.modeConfigId, 'mode')
    return requests.setConfigOption(mode.id, modeId).then((response) => {
      if (response?.configOptions !== undefined) {
        this.replaceConfigOptions(response.configOptions)
      } else {
        mode.currentValue = modeId
      }
    })
  }

  private replaceConfigOptions(value: unknown): void {
    if (!Array.isArray(value) || value.length > MAX_CONFIG_OPTIONS) {
      throw invalidConfiguration('ACP session configuration options are invalid')
    }
    const next = new Map<string, SelectOptionState>()
    for (const candidate of value) {
      if (!isRecord(candidate) || candidate.type !== 'select') continue
      const id = requireIdentifier(
        this.wireVersion === 1 ? candidate.id : candidate.configId,
        'ACP session configuration id',
      )
      if (next.has(id)) throw invalidConfiguration(`duplicate ACP session configuration: ${id}`)
      const currentValue = requireIdentifier(
        candidate.currentValue,
        `ACP session configuration value for ${id}`,
      )
      const values = parseSelectValues(candidate.options, id)
      if (!values.has(currentValue)) values.add(currentValue)
      next.set(id, {
        id,
        ...(typeof candidate.category === 'string' ? { category: candidate.category } : {}),
        currentValue,
        values,
      })
    }
    this.options.clear()
    for (const [id, option] of next) this.options.set(id, option)
  }

  private requireSelectOption(id: string, category: string): SelectOptionState {
    const option = this.options.get(id)
    if (!option || (option.category !== undefined && option.category !== category)) {
      throw invalidConfiguration(`ACP Agent did not advertise the ${category} configuration`)
    }
    return option
  }

  private availableModeIds(): Set<string> {
    if (this.modes) return this.modes.availableModeIds
    return this.requireSelectOption(this.definition.modeConfigId, 'mode').values
  }

  private currentModeId(): string {
    if (this.modes) return this.modes.currentModeId
    return this.requireSelectOption(this.definition.modeConfigId, 'mode').currentValue
  }

  private setCurrentMode(modeId: string): void {
    if (this.modes) this.modes.currentModeId = modeId
    const option = this.options.get(this.definition.modeConfigId)
    if (option) option.currentValue = modeId
  }
}

function parseModes(value: unknown): ModeState {
  if (!isRecord(value) || !Array.isArray(value.availableModes)) {
    throw invalidConfiguration('ACP session modes are invalid')
  }
  const currentModeId = requireIdentifier(value.currentModeId, 'ACP current mode')
  const availableModeIds = new Set<string>()
  for (const candidate of value.availableModes) {
    if (!isRecord(candidate)) throw invalidConfiguration('ACP session mode is invalid')
    const id = requireIdentifier(candidate.id, 'ACP session mode id')
    if (availableModeIds.has(id)) throw invalidConfiguration(`duplicate ACP session mode: ${id}`)
    availableModeIds.add(id)
  }
  if (!availableModeIds.has(currentModeId)) {
    throw invalidConfiguration(`ACP current mode is not advertised: ${currentModeId}`)
  }
  return { currentModeId, availableModeIds }
}

function parseSelectValues(value: unknown, configId: string): Set<string> {
  if (!Array.isArray(value)) {
    throw invalidConfiguration(`ACP session configuration values are invalid: ${configId}`)
  }
  const values = new Set<string>()
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      throw invalidConfiguration(`ACP session configuration value is invalid: ${configId}`)
    }
    if (Array.isArray(candidate.options)) {
      for (const child of candidate.options) addSelectValue(values, child, configId)
    } else {
      addSelectValue(values, candidate, configId)
    }
    if (values.size > MAX_CONFIG_VALUES) {
      throw invalidConfiguration(`ACP session configuration has too many values: ${configId}`)
    }
  }
  return values
}

function addSelectValue(values: Set<string>, value: unknown, configId: string): void {
  if (!isRecord(value)) {
    throw invalidConfiguration(`ACP session configuration value is invalid: ${configId}`)
  }
  const id = requireIdentifier(value.value, `ACP session configuration value for ${configId}`)
  if (values.has(id)) {
    throw invalidConfiguration(`duplicate ACP session configuration value: ${configId}/${id}`)
  }
  values.add(id)
}

function requireIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_CONFIG_ID_CHARS ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    throw invalidConfiguration(`${label} is invalid`)
  }
  return value
}

function invalidConfiguration(message: string): ConversationRuntimeError {
  return new ConversationRuntimeError('invalidConfiguration', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
