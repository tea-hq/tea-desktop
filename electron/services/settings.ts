import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { AppSettings } from '../../src/features/settings/contracts'
import { THEME_PREFERENCES, type ThemePreference } from '../../src/types/theme'

const SETTINGS_SCHEMA_VERSION = 1
const MAX_SETTINGS_BYTES = 64 * 1024

export class ElectronSettingsService {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    let bytes: Buffer
    try {
      bytes = await fs.readFile(this.filePath)
    } catch (error) {
      if (isMissingFile(error)) return defaultSettings()
      throw storageError('reading settings')
    }

    if (bytes.byteLength > MAX_SETTINGS_BYTES) return this.recoverCorrupt('file exceeds size limit')

    let stored: unknown
    try {
      stored = JSON.parse(bytes.toString('utf8'))
    } catch {
      return this.recoverCorrupt('invalid JSON')
    }

    if (!isRecord(stored) || stored.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      if (isRecord(stored) && typeof stored.schemaVersion === 'number') {
        throw serviceError('unsupportedSchema', false)
      }
      return this.recoverCorrupt('schemaVersion is missing or invalid')
    }

    const settings = normalizeAppSettings(stored.settings)
    if (!settings) return this.recoverCorrupt('settings payload is invalid')
    return settings
  }

  async update(settings: unknown): Promise<AppSettings> {
    const value = normalizeAppSettings(settings)
    if (!value) throw serviceError('invalidRequest', false)
    const parent = path.dirname(this.filePath)
    await fs.mkdir(parent, { recursive: true }).catch(() => {
      throw storageError('creating settings directory')
    })
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const bytes = `${JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, settings: value }, null, 2)}\n`
    try {
      await fs.writeFile(temporary, bytes, { encoding: 'utf8', flag: 'wx' })
      await fs.rename(temporary, this.filePath)
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
      throw storageError('writing settings')
    }
    return value
  }

  private async recoverCorrupt(reason: string): Promise<AppSettings> {
    const preserved = `${this.filePath}.${process.pid}.${Date.now()}.corrupt.json`
    try {
      await fs.rename(this.filePath, preserved)
    } catch {
      throw serviceError('storageFailure', true, reason)
    }
    return defaultSettings()
  }
}

export function defaultSettings(): AppSettings {
  return {
    locale: 'system',
    theme: 'system',
    conversationDefaults: { runtimeId: 'external.claude', model: null },
    layout: { leftSidebarOpen: true, agentDrawerOpen: false },
  }
}

function normalizeAppSettings(value: unknown): AppSettings | null {
  if (!isRecord(value)) return null
  const locale = value.locale
  const theme = value.theme === undefined ? 'system' : value.theme
  const defaults = value.conversationDefaults
  const layout = value.layout
  if (
    !(locale === 'system' || locale === 'en' || locale === 'zh-CN') ||
    !isThemePreference(theme) ||
    !isRecord(defaults) ||
    typeof defaults.runtimeId !== 'string' ||
    defaults.runtimeId.trim().length === 0 ||
    defaults.runtimeId.length > 256 ||
    !isRecord(layout) ||
    typeof layout.leftSidebarOpen !== 'boolean' ||
    typeof layout.agentDrawerOpen !== 'boolean'
  )
    return null
  const model = defaults.model
  if (
    model !== undefined &&
    model !== null &&
    (typeof model !== 'string' || model.trim().length === 0 || model.length > 512)
  )
    return null
  return {
    locale,
    theme,
    conversationDefaults: {
      runtimeId: defaults.runtimeId,
      model: typeof model === 'string' ? model : null,
    },
    layout: {
      leftSidebarOpen: layout.leftSidebarOpen,
      agentDrawerOpen: layout.agentDrawerOpen,
    },
  }
}

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(value: unknown): boolean {
  return isRecord(value) && value.code === 'ENOENT'
}

export function serviceError(
  code: string,
  retryable: boolean,
  message?: string,
): { code: string; retryable: boolean; message?: string } {
  return { code, retryable, ...(message ? { message } : {}) }
}

function storageError(operation: string): {
  code: string
  retryable: boolean
  message: string
} {
  return {
    code: 'storageFailure',
    retryable: true,
    message: `settings storage failed while ${operation}`,
  }
}
