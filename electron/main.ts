import { app, BrowserWindow, dialog, ipcMain, nativeTheme, type OpenDialogOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { isEffectiveTheme, type EffectiveTheme } from '../src/types/theme'
import type { DesktopCommandRouter } from './ipc/commandRouter'
import { settleDesktopCommand } from './ipc/commandResult'
import { createDesktopCommandRouter, type DesktopCommandServices } from './ipc/desktopCommandRouter'
import { DesktopEventPublisher } from './ipc/events'
import { applyWindowChromeTheme, createWindowChromeOptions } from './windowChrome'
import { channelHistoryToolDefinition } from '../src/features/conversation/hostToolCatalog'
import { createElectronConversationHost, type ElectronConversationHost } from './conversation/host'
import { CloudConversationCommandService } from './conversation/cloudCommandService'
import { TeaCenterCloudRunnerClient } from '../src/infrastructure/cloud/cloudRunnerClient'
import { ElectronCatalogService } from './services/catalog'
import { ElectronCenterAuthService } from './services/centerAuth'
import { ElectronChannelService } from './services/channel'
import { ElectronChannelAttachmentService } from './services/channelAttachments'
import { ElectronCredentialService } from './services/credentials'
import { ElectronManagedWorkspaceService } from './services/managedWorkspace'
import { ElectronCenterPluginService } from './services/centerPlugins'
import { ElectronPluginProcessService } from './services/plugins'
import { ElectronSettingsService } from './services/settings'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null
let services: DesktopCommandServices | null = null
let conversationHost: ElectronConversationHost | null = null
let cloudConversationCommands: CloudConversationCommandService | null = null
let quitting = false
const events = new DesktopEventPublisher(() => win?.webContents ?? null)

function createWindow(): void {
  const initialTheme: EffectiveTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 640,
    show: false,
    ...createWindowChromeOptions(process.platform, initialTheme),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win?.show())
  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(RENDERER_DIST, 'index.html'))
}

function registerWindowThemeIpc(): void {
  ipcMain.on('tea:window-theme-changed', (event, value: unknown) => {
    if (!isEffectiveTheme(value)) return

    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (!senderWindow || senderWindow !== win || senderWindow.isDestroyed()) return

    // The persisted preference remains settings-owned; this is only a native chrome projection.
    applyWindowChromeTheme(senderWindow, process.platform, value)
  })
}

function registerIpc(route: DesktopCommandRouter): void {
  ipcMain.handle('tea:command', (_event, command: unknown, args: unknown) =>
    settleDesktopCommand(() => route(command, args)),
  )
}

async function bootstrap(): Promise<void> {
  const settings = new ElectronSettingsService(path.join(app.getPath('userData'), 'settings.json'))
  let centerPlugins: ElectronCenterPluginService | null = null
  const centerAuth = new ElectronCenterAuthService(
    path.join(app.getPath('userData'), 'center-auth.json'),
    (state) => {
      events.publish('center-auth-state-changed', state)
      void centerPlugins?.synchronize(state).catch(() => undefined)
    },
  )
  centerPlugins = new ElectronCenterPluginService(centerAuth)
  const managedWorkspace = new ElectronManagedWorkspaceService(centerAuth, (state) =>
    events.publish('managed-workspace-state-changed', state),
  )
  conversationHost = await createElectronConversationHost({
    catalogPath: path.join(app.getPath('userData'), 'conversation-catalog.sqlite3'),
    workspaceId: 'desktop-workspace',
    workspacePath: process.cwd(),
    hostTools: [channelHistoryToolDefinition],
    events: {
      conversationEvent: (event) => events.publish('conversation:event', event),
      conversationUpdated: (summary) => events.publish('conversation:updated', summary),
      hostToolCall: (call) => events.publish('conversation:host-tool-call', call),
    },
    modelProviderResolver: {
      resolve: (providerId, modelId) => managedWorkspace.resolveModelProvider(providerId, modelId),
    },
    mandatoryHostTools: { definitions: () => centerPlugins!.mandatoryDefinitions() },
    mainHostToolHandler: centerPlugins,
  })
  const centerOrigin = centerAuth.centerOriginValue()
  const conversationCommands = centerOrigin
    ? (cloudConversationCommands = new CloudConversationCommandService(
        conversationHost.commands,
        new TeaCenterCloudRunnerClient({
          baseUrl: centerOrigin,
          accessToken: () => centerAuth.cloudAccessToken(),
          refreshAccessToken: () => centerAuth.refreshCloudAccessToken(),
        }),
        {
          conversationEvent: (event) => events.publish('conversation:event', event),
          conversationUpdated: (summary) => events.publish('conversation:updated', summary),
        },
      ))
    : conversationHost.commands
  const catalog = new ElectronCatalogService(
    path.join(app.getPath('userData'), 'catalog.json'),
    centerAuth,
  )
  const credentials = new ElectronCredentialService(
    path.join(app.getPath('userData'), 'credentials.json'),
  )
  const pluginProcesses = new ElectronPluginProcessService(catalog, credentials)
  const channelAttachments = new ElectronChannelAttachmentService(async () => {
    const options: OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  const channel = new ElectronChannelService(
    async () => managedWorkspace.getImCredentials(),
    (event) => events.publish('channel-event', event),
    undefined,
    channelAttachments,
    { isKnownContact: (accountId) => centerAuth.isDirectoryContact(accountId) },
  )

  const commandServices: DesktopCommandServices = {
    settings,
    conversation: conversationCommands,
    centerAuth,
    managedWorkspace,
    catalog,
    credentials,
    pluginProcesses,
    channel,
    selectDirectory: async () => {
      const options: OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
  }
  services = commandServices
  registerIpc(
    createDesktopCommandRouter(commandServices, {
      defaultEnterpriseDomain: process.env['TEA_CENTER_ENTERPRISE_DOMAIN'],
    }),
  )

  await centerAuth.initialize()
  await centerPlugins.synchronize().catch(() => undefined)
  await managedWorkspace.refresh().catch(() => undefined)
  await Promise.all([catalog.initialize(), conversationHost.initialize()])
  createWindow()
}

app.whenReady().then(() => {
  registerWindowThemeIpc()
  void bootstrap().catch(() => app.quit())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
  win = null
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void Promise.all([
    conversationHost?.shutdown(),
    cloudConversationCommands ? Promise.resolve(cloudConversationCommands.dispose()) : undefined,
    services?.pluginProcesses.shutdown(),
    services?.channel.dispose(),
  ]).finally(() => app.quit())
})
