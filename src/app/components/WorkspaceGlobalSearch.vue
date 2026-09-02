<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import { TeaInput } from '@/shared/ui'

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
  <div class="workspace-global-search relative" data-testid="workspace-global-search">
    <span
      class="i-mdi-magnify pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-subtle"
      aria-hidden="true"
    />
    <TeaInput
      v-model="globalSearchQuery"
      size="small"
      type="search"
      class="workspace-global-search__input min-h-9 pl-9 pr-10 text-sm"
      :label="t('workspace.globalSearch')"
      :placeholder="t('workspace.globalSearch')"
    />
    <span
      v-if="activeMode === 'channels'"
      role="img"
      class="pointer-events-none absolute right-3 top-1/2 z-10 size-1.5 -translate-y-1/2 rounded-full"
      :class="channelStatusClass"
      :aria-label="channelStatusLabel"
      :title="channelStatusLabel"
    />
  </div>
</template>

<style scoped>
.workspace-global-search :deep(input[type='search']) {
  background: var(--tea-canvas);
  border-color: var(--tea-line);
}

.workspace-global-search :deep(input[type='search']:focus) {
  border-color: var(--tea-fg);
}
</style>
