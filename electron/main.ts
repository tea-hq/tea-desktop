import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DESKTOP_COMMANDS, type DesktopCommand } from '../src/types/electronBridge'
import { ElectronCenterAuthService } from './services/centerAuth'
import { ElectronCatalogService } from './services/catalog'
import { ElectronConversationService } from './services/conversation'
import { ElectronCredentialService } from './services/credentials'
import { ElectronChannelService } from './services/channel'
import { ElectronManagedWorkspaceService } from './services/managedWorkspace'
import { ElectronSettingsService } from './services/settings'
import { ElectronPluginProcessService, type PluginInvocationRequest } from './services/plugins'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null
let settingsService: ElectronSettingsService | null = null
let conversationService: ElectronConversationService | null = null
let centerAuthService: ElectronCenterAuthService | null = null
let managedWorkspaceService: ElectronManagedWorkspaceService | null = null
let catalogService: ElectronCatalogService | null = null
let credentialService: ElectronCredentialService | null = null
let pluginProcessService: ElectronPluginProcessService | null = null
let channelService: ElectronChannelService | null = null
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

function registerIpc(): void {
  ipcMain.handle('tea:command', async (_event, command: unknown, args: unknown) => {
    if (!isDesktopCommand(command)) throw { code: 'unsupportedCommand', retryable: false }
    return handleCommand(command, args)
  })
}

function isDesktopCommand(value: unknown): value is DesktopCommand {
  return typeof value === 'string' && (DESKTOP_COMMANDS as readonly string[]).includes(value)
}

async function handleCommand(command: DesktopCommand, _args: unknown): Promise<unknown> {
  const args = _args === undefined ? {} : readRecord(_args)
  switch (command) {
    case 'resolve_center_enterprise':
      return requireCenterAuthService().resolveEnterprise(readString(args.domain, 'domain'))
    case 'start_center_login':
      return requireCenterAuthService().startLogin(readString(args.domain, 'domain'))
    case 'cancel_center_login':
      return requireCenterAuthService().cancelLogin()
    case 'get_center_auth_state':
      return (
        requireCenterAuthService().stateValue() &&
        requireManagedWorkspaceService()
          .refresh()
          .catch(() => undefined)
          .then(() => ({
            state: requireCenterAuthService().stateValue(),
            defaultEnterpriseDomain: normalizeDomain(process.env['TEA_CENTER_ENTERPRISE_DOMAIN']),
          }))
      )
    case 'refresh_center_bootstrap':
      return requireCenterAuthService()
        .refreshBootstrap()
        .then(async (state) => {
          await requireManagedWorkspaceService()
            .refresh()
            .catch(() => undefined)
          return state
        })
    case 'logout_center':
      return requireCenterAuthService()
        .logout()
        .then(async (state) => {
          await requireManagedWorkspaceService()
            .refresh()
            .catch(() => undefined)
          return state
        })
    case 'list_center_directory_users':
      return requireCenterAuthService().listDirectoryUsers()
    case 'get_managed_workspace_state':
      return requireManagedWorkspaceService().stateValue()
    case 'refresh_managed_workspace':
      return requireManagedWorkspaceService().refresh()
    case 'get_managed_im_credentials':
      return requireManagedWorkspaceService().getImCredentials()
    case 'get_settings':
      return requireSettingsService().load()
    case 'update_settings':
      return requireSettingsService().update(args.settings)
    case 'list_conversation_runtimes':
      return requireConversationService().listRuntimes()
    case 'list_conversations':
      return requireConversationService().listConversations(readRecord(args.request) as never)
    case 'get_conversation':
      return requireConversationService().getConversation(
        readString(args.conversationId, 'conversationId'),
      )
    case 'load_conversation_history':
      return requireConversationService().loadHistory(readRecord(args.request) as never)
    case 'create_conversation':
      return requireConversationService().createConversation(
        readString(args.runtimeId, 'runtimeId'),
        readString(args.idempotencyKey, 'idempotencyKey'),
        args.channelBinding as never,
        Array.isArray(args.hostTools) ? (args.hostTools as never) : [],
      )
    case 'configure_conversation_host_tools':
      return requireConversationService().configureHostTools(
        readString(args.conversationId, 'conversationId'),
        Array.isArray(args.hostTools) ? (args.hostTools as never) : [],
      )
    case 'append_conversation_sources':
      return requireConversationService().appendSources(
        readString(args.conversationId, 'conversationId'),
        readInteger(args.turnIndex, 'turnIndex'),
        Array.isArray(args.sources) ? (args.sources as never) : [],
      )
    case 'create_channel_draft':
      return requireConversationService().createDraft(
        readString(args.conversationId, 'conversationId'),
        readInteger(args.sourceTurnIndex, 'sourceTurnIndex'),
        readString(args.sourceBlockId, 'sourceBlockId'),
        readString(args.content, 'content'),
      )
    case 'update_channel_draft':
      return requireConversationService().updateDraft(
        readString(args.draftId, 'draftId'),
        readString(args.content, 'content'),
      )
    case 'prepare_draft_delivery':
      return requireConversationService().prepareDelivery(readString(args.draftId, 'draftId'))
    case 'mark_draft_delivery_sending':
      return requireConversationService().updateDelivery(
        readString(args.deliveryId, 'deliveryId'),
        'sending',
      )
    case 'complete_draft_delivery':
      return requireConversationService().updateDelivery(
        readString(args.deliveryId, 'deliveryId'),
        'sent',
        args.sentMessageRef as never,
      )
    case 'fail_draft_delivery':
      return requireConversationService().updateDelivery(
        readString(args.deliveryId, 'deliveryId'),
        'failed',
        undefined,
        readString(args.failureCode, 'failureCode'),
      )
    case 'send_message':
      return requireConversationService().send(
        readString(args.conversationId, 'conversationId'),
        readString(args.text, 'text'),
        {
          model: args.model === null ? 'default' : readString(args.model, 'model'),
          permissionMode: readPermissionMode(args.permissionMode),
        },
        Array.isArray(args.sources) ? (args.sources as never) : [],
      )
    case 'cancel_conversation':
      return requireConversationService().cancel(readString(args.conversationId, 'conversationId'))
    case 'respond_to_approval':
      return requireConversationService().respondToApproval(
        readString(args.conversationId, 'conversationId'),
        readString(args.approvalId, 'approvalId'),
        readApprovalDecision(args.decision),
      )
    case 'resolve_host_tool_call':
      return requireConversationService().resolveHostToolCall(args.result as never)
    case 'rename_conversation':
      return requireConversationService().rename(
        readString(args.conversationId, 'conversationId'),
        readString(args.title, 'title'),
      )
    case 'archive_conversation':
      return requireConversationService().archive(readString(args.conversationId, 'conversationId'))
    case 'delete_conversation':
      return requireConversationService().remove(readString(args.conversationId, 'conversationId'))
    case 'list_plugins':
      return requireCatalogService().listPlugins()
    case 'enable_plugin':
      return requireCatalogService().setPluginEnabled(readString(args.pluginId, 'pluginId'), true)
    case 'disable_plugin':
      return requirePluginProcessService()
        .disable(readString(args.pluginId, 'pluginId'))
        .then(() =>
          requireCatalogService().setPluginEnabled(readString(args.pluginId, 'pluginId'), false),
        )
    case 'invoke_plugin_action':
      return requirePluginProcessService().invoke({
        pluginId: readString(args.pluginId, 'pluginId'),
        connectionId: readString(args.connectionId, 'connectionId'),
        actionId: readString(args.actionId, 'actionId'),
        input: readRecord(args.input),
      } satisfies PluginInvocationRequest)
    case 'list_skills':
      return requireCatalogService().listSkills()
    case 'list_agent_roles':
      return requireCatalogService().listAgentRoleRevisions()
    case 'save_agent_role_revision':
      return requireCatalogService()
        .saveAgentRoleRevision(readRecord(args.revision) as never)
        .then(() => undefined)
    case 'get_agent_role_cache':
      return requireCatalogService().getAgentRoleCache()
    case 'sync_agent_roles': {
      const request = readRecord(args.request)
      return requireCatalogService().syncAgentRoles({
        tenantId: readString(request.tenantId, 'tenantId'),
        subjectId: readString(request.subjectId, 'subjectId'),
      })
    }
    case 'list_credentials':
      return requireCredentialService().list()
    case 'save_plugin_credentials':
      return requireCredentialService().save(readRecord(args.mutation) as never)
    case 'clear_plugin_credentials':
      return requireCredentialService().clear(
        readString(args.pluginId, 'pluginId'),
        readString(args.connectionId, 'connectionId'),
      )
    case 'get_channel_descriptor':
      return requireChannelService().descriptor()
    case 'get_channel_status':
      return requireChannelService().status()
    case 'get_channel_self_profile':
      return requireChannelService().selfProfile()
    case 'open_direct_conversation':
      return requireChannelService().openDirectConversation(readString(args.accountId, 'accountId'))
    case 'reconnect_channel':
      return requireChannelService().connect()
    case 'disconnect_channel':
      return requireChannelService().disconnect()
    case 'list_channels':
      return requireChannelService().listChannels(readRecord(args.request) as never)
    case 'load_channel_messages':
      return requireChannelService().loadMessages(readRecord(args.request) as never)
    case 'send_channel_message':
      return requireChannelService().sendMessage(readRecord(args.request) as never)
    case 'mark_channel_read':
      return requireChannelService().markRead(readString(args.channelRef, 'channelRef'))
    default:
      throw { code: 'serviceNotMigrated', retryable: true }
  }
}

function requireSettingsService(): ElectronSettingsService {
  if (!settingsService) throw { code: 'storageFailure', retryable: true }
  return settingsService
}

function requireConversationService(): ElectronConversationService {
  if (!conversationService) throw { code: 'storageFailure', retryable: true }
  return conversationService
}

function requireCenterAuthService(): ElectronCenterAuthService {
  if (!centerAuthService) throw { code: 'storageFailure', retryable: true }
  return centerAuthService
}

function requireManagedWorkspaceService(): ElectronManagedWorkspaceService {
  if (!managedWorkspaceService) throw { code: 'storageFailure', retryable: true }
  return managedWorkspaceService
}

function requireCatalogService(): ElectronCatalogService {
  if (!catalogService) throw { code: 'storageFailure', retryable: true }
  return catalogService
}

function requireCredentialService(): ElectronCredentialService {
  if (!credentialService) throw { code: 'storageFailure', retryable: true }
  return credentialService
}

function requireChannelService(): ElectronChannelService {
  if (!channelService) throw { code: 'storageFailure', retryable: true }
  return channelService
}

function requirePluginProcessService(): ElectronPluginProcessService {
  if (!pluginProcessService) throw { code: 'storageFailure', retryable: true }
  return pluginProcessService
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw { code: 'invalidRequest', retryable: false }
  }
  return value as Record<string, unknown>
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw {
      code: 'invalidRequest',
      retryable: false,
      message: `${name} must be a non-empty string`,
    }
  return value
}

function readInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value))
    throw {
      code: 'invalidRequest',
      retryable: false,
      message: `${name} must be an integer`,
    }
  return value as number
}

function readPermissionMode(value: unknown): 'default' | 'readOnly' | 'fullAccess' {
  if (value === 'default' || value === 'readOnly' || value === 'fullAccess') return value
  throw {
    code: 'invalidRequest',
    retryable: false,
    message: 'permissionMode is invalid',
  }
}

function readApprovalDecision(value: unknown): 'allowOnce' | 'allowSession' | 'deny' | 'cancel' {
  if (value === 'allowOnce' || value === 'allowSession' || value === 'deny' || value === 'cancel')
    return value
  throw {
    code: 'invalidRequest',
    retryable: false,
    message: 'approval decision is invalid',
  }
}

function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLocaleLowerCase('en')
  return /^[a-z0-9](?:[a-z0-9.-]{0,252}[a-z0-9])?$/.test(normalized) ? normalized : null
}

app.whenReady().then(() => {
  settingsService = new ElectronSettingsService(path.join(app.getPath('userData'), 'settings.json'))
  centerAuthService = new ElectronCenterAuthService(
    path.join(app.getPath('userData'), 'center-auth.json'),
    (state) => win?.webContents.send('tea:event:center-auth-state-changed', state),
  )
  conversationService = new ElectronConversationService(
    path.join(app.getPath('userData'), 'conversation-state.json'),
    process.cwd(),
    (event) => win?.webContents.send('tea:event:conversation:event', event),
    (summary) => win?.webContents.send('tea:event:conversation:updated', summary),
    (call) => win?.webContents.send('tea:event:conversation:host-tool-call', call),
  )
  managedWorkspaceService = new ElectronManagedWorkspaceService(centerAuthService, (state) =>
    win?.webContents.send('tea:event:managed-workspace-state-changed', state),
  )
  catalogService = new ElectronCatalogService(
    path.join(app.getPath('userData'), 'catalog.json'),
    centerAuthService,
  )
  credentialService = new ElectronCredentialService(
    path.join(app.getPath('userData'), 'credentials.json'),
  )
  pluginProcessService = new ElectronPluginProcessService(catalogService, credentialService)
  channelService = new ElectronChannelService(
    async () => requireManagedWorkspaceService().getImCredentials(),
    (event) => win?.webContents.send('tea:event:channel-event', event),
  )
  registerIpc()
  void Promise.all([
    centerAuthService.initialize(),
    conversationService.initialize(),
    catalogService.initialize(),
  ]).then(async () => {
    await managedWorkspaceService?.refresh().catch(() => undefined)
    createWindow()
  })
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
    conversationService?.shutdown(),
    pluginProcessService?.shutdown(),
    channelService?.dispose(),
  ]).finally(() => app.quit())
})
