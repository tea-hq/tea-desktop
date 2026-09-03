<script setup lang="ts">
import type { DesktopCommand, TeaDesktopBridge } from '@/types/electronBridge'
import type { CredentialMutation, CredentialRecord } from '@/features/credentials/contracts'
import type { PluginRecord } from '@/features/plugins/contracts'
import type { SkillRecord } from '@/features/skills/contracts'
import ManagementWorkspace from '@/features/management/components/ManagementWorkspace.vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
locale.value = new URLSearchParams(window.location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en'

const localPlugins: PluginRecord[] = [
  {
    id: 'github',
    version: '1.4.0',
    displayName: 'GitHub',
    description: 'Issues, pull requests, releases, and repository metadata.',
    enabled: true,
    source: 'local',
    sourceFormat: 'manifest',
    updatedAt: '2026-08-30T08:00:00.000Z',
    actions: [
      { id: 'listIssues', version: '1', description: 'List issues', effect: 'read' },
      { id: 'createIssue', version: '1', description: 'Create an issue', effect: 'write' },
    ],
    connections: [{ id: 'work', displayName: 'Work account', enabled: true, configured: true }],
  },
  {
    id: 'git',
    version: '0.8.2',
    displayName: 'Git',
    description: 'Local repository status and history for the active workspace.',
    enabled: true,
    source: 'local',
    sourceFormat: 'manifest',
    updatedAt: '2026-08-18T08:00:00.000Z',
    actions: [
      { id: 'status', version: '1', description: 'Read repository status', effect: 'read' },
      { id: 'diff', version: '1', description: 'Read repository diff', effect: 'read' },
    ],
    connections: [{ id: 'workspace', displayName: 'Current workspace', enabled: true }],
  },
]

const remotePlugins: PluginRecord[] = [
  {
    id: 'grafana',
    version: 'cloud',
    displayName: 'Grafana',
    description: 'Explore dashboards, alerts, and observability context.',
    enabled: true,
    source: 'remote',
    sourceFormat: 'center.openapi',
    baseUrl: 'https://grafana.example.test',
    updatedAt: '2026-09-02T08:00:00.000Z',
    credentialConfigured: false,
    actions: [
      { id: 'queryDashboard', version: 'cloud', description: 'Query a dashboard', effect: 'read' },
      { id: 'listAlerts', version: 'cloud', description: 'List active alerts', effect: 'read' },
    ],
    connections: [{ id: 'center', displayName: 'Tea Center', enabled: true, configured: false }],
  },
  {
    id: 'gitlab',
    version: 'cloud',
    displayName: 'GitLab',
    description: 'Read merge requests and project delivery signals.',
    enabled: true,
    source: 'remote',
    sourceFormat: 'center.openapi',
    updatedAt: '2026-09-01T08:00:00.000Z',
    credentialConfigured: true,
    actions: [
      {
        id: 'listMergeRequests',
        version: 'cloud',
        description: 'List merge requests',
        effect: 'read',
      },
    ],
    connections: [{ id: 'center', displayName: 'Tea Center', enabled: true, configured: true }],
  },
]

const credentials: CredentialRecord[] = [
  {
    pluginId: 'github',
    connectionId: 'work',
    configured: true,
    updatedAt: Date.parse('2026-08-30'),
  },
  {
    pluginId: 'grafana',
    connectionId: 'center',
    configured: false,
    updatedAt: Date.parse('2026-08-28'),
  },
]

const skills: SkillRecord[] = [
  {
    id: 'release-notes',
    version: '1.2.0',
    displayName: 'Release notes',
    description: 'Turn changes and decisions into concise release notes.',
    enabled: true,
    source: 'builtIn',
  },
  {
    id: 'incident-review',
    version: '0.4.0',
    displayName: 'Incident review',
    description: 'Structure incident timelines, impact, and follow-up actions.',
    enabled: true,
    source: 'workspace',
  },
]

const roleRevisions = [
  {
    roleId: 'release-coordinator',
    name: 'Release coordinator',
    description: 'Keep weekly shipping visible and low-risk.',
    runtimeId: 'external.claude',
    currentRevision: {
      revision: 2,
      runtimeId: 'external.claude',
      modelId: 'gpt-5.6-sol',
      systemPrompt: 'Coordinate releases and surface risk before changes are made.',
      userPromptTemplate: '',
      capabilities: [],
      dependencies: [],
    },
  },
]

const bridge: TeaDesktopBridge = {
  setWindowTheme: () => {},
  on: () => () => {},
  invoke: async <T,>(command: DesktopCommand, args?: unknown): Promise<T> => {
    switch (command) {
      case 'list_plugins':
        return localPlugins as T
      case 'list_remote_plugins':
        return remotePlugins as T
      case 'list_credentials':
        return credentials as T
      case 'list_skills':
        return skills as T
      case 'list_agent_roles':
        return roleRevisions as T
      case 'enable_plugin':
      case 'disable_plugin': {
        const pluginId = (args as { pluginId?: string } | undefined)?.pluginId
        const plugin = localPlugins.find((item) => item.id === pluginId)
        if (plugin) plugin.enabled = command === 'enable_plugin'
        return undefined as T
      }
      case 'save_plugin_credentials': {
        const mutation = (args as { mutation?: CredentialMutation } | undefined)?.mutation
        return {
          pluginId: mutation?.pluginId ?? '',
          connectionId: mutation?.connectionId ?? '',
          configured: true,
          updatedAt: Date.now(),
        } as T
      }
      case 'clear_plugin_credentials':
      case 'save_agent_role_revision':
        return undefined as T
      default:
        return [] as T
    }
  },
}

window.teaDesktop = bridge
</script>

<template>
  <div class="flex min-h-screen min-w-0 bg-canvas text-fg" data-testid="management-fixture">
    <ManagementWorkspace />
  </div>
</template>
