import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultSettings, ElectronSettingsService } from './settings'

async function settingsPath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tea-electron-settings-'))
  return path.join(directory, 'settings.json')
}

describe('ElectronSettingsService', () => {
  it('returns the desktop defaults when the file does not exist', async () => {
    const service = new ElectronSettingsService(await settingsPath())

    await expect(service.load()).resolves.toEqual(defaultSettings())
  })

  it('writes and reloads the versioned settings payload', async () => {
    const filePath = await settingsPath()
    const service = new ElectronSettingsService(filePath)
    const settings = {
      locale: 'zh-CN' as const,
      theme: 'dark' as const,
      conversationDefaults: { runtimeId: 'external.codex', model: 'provider/model-a' },
      layout: { leftSidebarOpen: false, agentDrawerOpen: true },
    }

    await expect(service.update(settings)).resolves.toEqual(settings)
    await expect(service.load()).resolves.toEqual(settings)
    await expect(readFile(filePath, 'utf8')).resolves.toContain('"schemaVersion": 1')
  })

  it('normalizes settings written before the default model was added', async () => {
    const filePath = await settingsPath()
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        settings: {
          locale: 'en',
          theme: undefined,
          conversationDefaults: { runtimeId: 'external.claude' },
          layout: { leftSidebarOpen: true, agentDrawerOpen: false },
        },
      }),
    )
    const service = new ElectronSettingsService(filePath)

    await expect(service.load()).resolves.toMatchObject({
      conversationDefaults: { runtimeId: 'external.claude', model: null },
    })
  })

  it('rejects unsupported schemas without silently downgrading them', async () => {
    const filePath = await settingsPath()
    await writeFile(filePath, JSON.stringify({ schemaVersion: 2, settings: defaultSettings() }))
    const service = new ElectronSettingsService(filePath)

    await expect(service.load()).rejects.toMatchObject({
      code: 'unsupportedSchema',
      retryable: false,
    })
  })

  it('rejects theme values outside the supported allowlist', async () => {
    const service = new ElectronSettingsService(await settingsPath())

    await expect(service.update({ ...defaultSettings(), theme: 'sepia' })).rejects.toMatchObject({
      code: 'invalidRequest',
      retryable: false,
    })
  })

  it('preserves corrupt settings and returns defaults', async () => {
    const filePath = await settingsPath()
    await writeFile(filePath, '{not-json')
    const service = new ElectronSettingsService(filePath)

    await expect(service.load()).resolves.toEqual(defaultSettings())
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
