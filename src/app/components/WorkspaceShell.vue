<script setup lang="ts">
import OfflineProfileNotice from '@/features/auth/components/OfflineProfileNotice.vue'
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'
import WorkspaceContent from './WorkspaceContent.vue'
import WorkspaceOverlays from './WorkspaceOverlays.vue'
import WorkspaceRail from './WorkspaceRail.vue'

const { centerAuth, activeMode, globalSearchQuery, logoutPending, selectWorkspace, logout } =
  useTeaDesktopAppContext()
</script>

<template>
  <div
    class="relative flex h-full min-h-0 min-w-0 overflow-hidden bg-canvas text-fg"
    :class="centerAuth.state.phase === 'offlineCached' ? 'pt-9' : ''"
  >
    <OfflineProfileNotice
      v-if="centerAuth.state.phase === 'offlineCached'"
      :last-validated-at="centerAuth.state.lastValidatedAt"
    />
    <div class="flex min-h-0 flex-1">
      <WorkspaceRail
        :active-mode="activeMode"
        :pending-tasks="0"
        :logout-pending="logoutPending"
        :user="centerAuth.state.bootstrap?.user ?? null"
        @select="selectWorkspace"
        @logout="logout"
      />
      <WorkspaceContent :global-search-query="globalSearchQuery" />
    </div>
    <WorkspaceOverlays />
  </div>
</template>
