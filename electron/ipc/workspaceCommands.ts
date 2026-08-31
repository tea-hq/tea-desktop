import type { ElectronCenterAuthService } from '../services/centerAuth'
import type { ElectronManagedWorkspaceService } from '../services/managedWorkspace'
import type { ElectronSettingsService } from '../services/settings'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import { readString } from './commandValidation'

export interface WorkspaceCommandServices {
  centerAuth: ElectronCenterAuthService
  managedWorkspace: ElectronManagedWorkspaceService
  settings: ElectronSettingsService
  selectDirectory: () => Promise<string | null>
}

export interface WorkspaceCommandOptions {
  defaultEnterpriseDomain?: string
}

export function createWorkspaceCommandHandlers(
  services: WorkspaceCommandServices,
  options: WorkspaceCommandOptions = {},
): DesktopCommandHandlerGroup {
  const refreshManagedWorkspace = () => services.managedWorkspace.refresh().catch(() => undefined)

  return defineCommandHandlers('workspace', {
    resolve_center_enterprise: (args) =>
      services.centerAuth.resolveEnterprise(readString(args.domain, 'domain')),
    start_center_login: (args) => services.centerAuth.startLogin(readString(args.domain, 'domain')),
    cancel_center_login: () => services.centerAuth.cancelLogin(),
    get_center_auth_state: async () => {
      await refreshManagedWorkspace()
      return {
        state: services.centerAuth.stateValue(),
        defaultEnterpriseDomain: normalizeDomain(options.defaultEnterpriseDomain),
      }
    },
    refresh_center_bootstrap: async () => {
      const state = await services.centerAuth.refreshBootstrap()
      await refreshManagedWorkspace()
      return state
    },
    logout_center: async () => {
      const state = await services.centerAuth.logout()
      await refreshManagedWorkspace()
      return state
    },
    list_center_directory_users: () => services.centerAuth.listDirectoryUsers(),
    get_managed_workspace_state: () => services.managedWorkspace.stateValue(),
    refresh_managed_workspace: () => services.managedWorkspace.refresh(),
    get_managed_im_credentials: () => services.managedWorkspace.getImCredentials(),
    get_settings: () => services.settings.load(),
    update_settings: (args) => services.settings.update(args.settings),
    select_directory: () => services.selectDirectory(),
  } satisfies Partial<DesktopCommandHandlers>)
}

function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLocaleLowerCase('en')
  return /^[a-z0-9](?:[a-z0-9.-]{0,252}[a-z0-9])?$/.test(normalized) ? normalized : null
}
