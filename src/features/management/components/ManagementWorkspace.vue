<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ManagementNavigation from './ManagementNavigation.vue'
import { useManagementStore } from '../store'
import CredentialCenter from '@/features/credentials/components/CredentialCenter.vue'
import PluginCenter from '@/features/plugins/components/PluginCenter.vue'
import SkillCenter from '@/features/skills/components/SkillCenter.vue'
import AgentRoleCenter from '@/features/agent-roles/components/AgentRoleCenter.vue'
import { useCredentialsStore } from '@/features/credentials/store'
import { ElectronCredentialClient } from '@/infrastructure/credentials/electronCredentialClient'
import { usePluginsStore } from '@/features/plugins/store'
import { ElectronPluginClient } from '@/infrastructure/plugins/electronPluginClient'

const management = useManagementStore()
const credentials = useCredentialsStore()
const plugins = usePluginsStore()
const { t } = useI18n()
const sectionTitle = computed(() => t(`management.${management.activeSection}.title`))
defineEmits<{ close: [] }>()
credentials.configure(new ElectronCredentialClient())
plugins.configure(new ElectronPluginClient())
</script>
<template>
  <div class="flex min-h-0 flex-1 bg-canvas">
    <ManagementNavigation
      :active-section="management.activeSection"
      @select="management.selectSection"
    />
    <main class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex min-h-12 shrink-0 items-center justify-between border-b border-line-soft bg-canvas px-6 py-2"
      >
        <div class="flex min-w-0 items-center gap-2 text-sm">
          <span class="i-mdi-tune-variant size-4 shrink-0 text-subtle" aria-hidden="true" />
          <span class="text-subtle">{{ t('management.workspaceLabel') }}</span>
          <span class="text-disabled">/</span>
          <span class="truncate font-medium text-fg">{{ sectionTitle }}</span>
        </div>
        <TeaButton
          appearance="ghost"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-full p-0 text-subtle hover:bg-hover hover:text-fg"
          :aria-label="t('management.close')"
          :title="t('management.close')"
          @click="$emit('close')"
          ><span class="i-mdi-close size-4" aria-hidden="true"
        /></TeaButton>
      </header>
      <CredentialCenter v-if="management.activeSection === 'credentials'" />
      <PluginCenter v-else-if="management.activeSection === 'plugins'" />
      <SkillCenter v-else-if="management.activeSection === 'skills'" />
      <AgentRoleCenter v-else />
    </main>
  </div>
</template>
