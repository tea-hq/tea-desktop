import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { DesktopCommandRouter } from './ipc/commandRouter'
import { createDesktopCommandRouter, type DesktopCommandServices } from './ipc/desktopCommandRouter'
import { ElectronCatalogService } from './services/catalog'
import { ElectronCenterAuthService } from './services/centerAuth'
import { ElectronChannelService } from './services/channel'
import { ElectronConversationService } from './services/conversation'
import { ElectronCredentialService } from './services/credentials'
import { ElectronManagedWorkspaceService } from './services/managedWorkspace'
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
let quitting = false

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 640,
    show: false,
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

function registerIpc(route: DesktopCommandRouter): void {
  ipcMain.handle('tea:command', (_event, command: unknown, args: unknown) => route(command, args))
}

app.whenReady().then(() => {
  const settings = new ElectronSettingsService(path.join(app.getPath('userData'), 'settings.json'))
  const centerAuth = new ElectronCenterAuthService(
    path.join(app.getPath('userData'), 'center-auth.json'),
    (state) => win?.webContents.send('tea:event:center-auth-state-changed', state),
  )
  const conversation = new ElectronConversationService(
    path.join(app.getPath('userData'), 'conversation-state.json'),
    process.cwd(),
    (event) => win?.webContents.send('tea:event:conversation:event', event),
    (summary) => win?.webContents.send('tea:event:conversation:updated', summary),
    (call) => win?.webContents.send('tea:event:conversation:host-tool-call', call),
  )
  const managedWorkspace = new ElectronManagedWorkspaceService(centerAuth, (state) =>
    win?.webContents.send('tea:event:managed-workspace-state-changed', state),
  )
  const catalog = new ElectronCatalogService(
    path.join(app.getPath('userData'), 'catalog.json'),
    centerAuth,
  )
  const credentials = new ElectronCredentialService(
    path.join(app.getPath('userData'), 'credentials.json'),
  )
  const pluginProcesses = new ElectronPluginProcessService(catalog, credentials)
  const channel = new ElectronChannelService(
    async () => managedWorkspace.getImCredentials(),
    (event) => win?.webContents.send('tea:event:channel-event', event),
  )

  services = {
    settings,
    conversation,
    centerAuth,
    managedWorkspace,
    catalog,
    credentials,
    pluginProcesses,
    channel,
  }
  registerIpc(
    createDesktopCommandRouter(services, {
      defaultEnterpriseDomain: process.env['TEA_CENTER_ENTERPRISE_DOMAIN'],
    }),
  )

  void Promise.all([centerAuth.initialize(), conversation.initialize(), catalog.initialize()]).then(
    async () => {
      await managedWorkspace.refresh().catch(() => undefined)
      createWindow()
    },
  )

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
    services?.conversation.shutdown(),
    services?.pluginProcesses.shutdown(),
    services?.channel.dispose(),
  ]).finally(() => app.quit())
})
