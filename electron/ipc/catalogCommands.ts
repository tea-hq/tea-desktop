import type { ElectronCatalogService } from '../services/catalog'
import type { ElectronCenterPluginService } from '../services/centerPlugins'
import type { ElectronCredentialService } from '../services/credentials'
import type { ElectronPluginProcessService, PluginInvocationRequest } from '../services/plugins'
import {
  defineCommandHandlers,
  type DesktopCommandHandlerGroup,
  type DesktopCommandHandlers,
} from './commandRouter'
import { readRecord, readString } from './commandValidation'

export interface CatalogCommandServices {
  catalog: ElectronCatalogService
  centerPlugins: ElectronCenterPluginService
  credentials: ElectronCredentialService
  pluginProcesses: ElectronPluginProcessService
}

export function createCatalogCommandHandlers(
  services: CatalogCommandServices,
): DesktopCommandHandlerGroup {
  return defineCommandHandlers('catalog', {
    list_plugins: () => services.catalog.listPlugins(),
    list_remote_plugins: () => services.centerPlugins.listRemotePlugins(),
    enable_plugin: (args) =>
      services.catalog.setPluginEnabled(readString(args.pluginId, 'pluginId'), true),
    disable_plugin: async (args) => {
      const pluginId = readString(args.pluginId, 'pluginId')
      await services.pluginProcesses.disable(pluginId)
      await services.catalog.setPluginEnabled(pluginId, false)
    },
    invoke_plugin_action: (args) =>
      services.pluginProcesses.invoke({
        pluginId: readString(args.pluginId, 'pluginId'),
        connectionId: readString(args.connectionId, 'connectionId'),
        actionId: readString(args.actionId, 'actionId'),
        input: readRecord(args.input),
      } satisfies PluginInvocationRequest),
    list_skills: () => services.catalog.listSkills(),
    list_agent_roles: () => services.catalog.listAgentRoleRevisions(),
    save_agent_role_revision: (args) =>
      services.catalog
        .saveAgentRoleRevision(readRecord(args.revision) as never)
        .then(() => undefined),
    get_agent_role_cache: () => services.catalog.getAgentRoleCache(),
    sync_agent_roles: (args) => {
      const request = readRecord(args.request)
      return services.catalog.syncAgentRoles({
        tenantId: readString(request.tenantId, 'tenantId'),
        subjectId: readString(request.subjectId, 'subjectId'),
      })
    },
    list_credentials: () => services.credentials.list(),
    save_plugin_credentials: (args) =>
      services.credentials.save(readRecord(args.mutation) as never),
    clear_plugin_credentials: (args) =>
      services.credentials.clear(
        readString(args.pluginId, 'pluginId'),
        readString(args.connectionId, 'connectionId'),
      ),
  } satisfies Partial<DesktopCommandHandlers>)
}
