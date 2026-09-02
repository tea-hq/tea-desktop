<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import WorkspaceSearchField from './WorkspaceSearchField.vue'

const { activeMode, channels, globalSearchQuery } = useTeaDesktopAppContext()
const { t } = useI18n()

const channelStatusLabel = computed(() => {
  if (channels.loadingChannels && channels.channels.length === 0) return t('channels.loading')
  return t(`channels.connection.${channels.status.phase}`)
})

const channelStatusClass = computed(() => {
  if (channels.loadingChannels && channels.channels.length === 0)
    return 'animate-pulse bg-muted motion-reduce:animate-none'
  if (channels.status.phase === 'connected') return 'bg-success'
  if (channels.status.phase === 'failed' || channels.status.phase === 'kickedOffline')
    return 'bg-danger'
  return 'bg-muted'
})
</script>

<template>
  <WorkspaceSearchField
    data-testid="workspace-global-search"
    :model-value="globalSearchQuery"
    :label="t('workspace.globalSearch')"
    :status-label="activeMode === 'channels' ? channelStatusLabel : undefined"
    :status-class="activeMode === 'channels' ? channelStatusClass : undefined"
    @update:model-value="globalSearchQuery = $event"
  />
</template>
