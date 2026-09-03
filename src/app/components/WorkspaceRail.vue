<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createDefaultAvatarDataUri } from '@/shared/avatar/defaultAvatar'
import { TeaAvatar, TeaIconButton } from '@/shared/ui'
import type { ChannelUserProfile } from '@/features/channels/contracts'

export type WorkspaceMode =
  'channels' | 'agent' | 'tasks' | 'directory' | 'management' | 'profile' | 'settings'

const props = withDefaults(
  defineProps<{
    activeMode: WorkspaceMode
    pendingTasks: number
    logoutPending: boolean
    user: {
      id?: string
      displayName: string
      preferredUsername: string
      avatarUrl: string
    } | null
    imProfile?: ChannelUserProfile | null
  }>(),
  { imProfile: null },
)

const emit = defineEmits<{
  select: [mode: WorkspaceMode]
  logout: []
}>()
const { t } = useI18n()
const initials = computed(() =>
  Array.from(props.user?.displayName || props.user?.preferredUsername || 'T')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase(),
)
const generatedAvatarUrl = computed(() =>
  props.imProfile?.accountId?.trim()
    ? createDefaultAvatarDataUri(`tea:account:${props.imProfile.accountId}`)
    : '',
)

const entries: Array<{ mode: WorkspaceMode; icon: string; key: string }> = [
  { mode: 'channels', icon: 'i-mdi-message-text-outline', key: 'workspace.channels' },
  { mode: 'agent', icon: 'i-mdi-creation-outline', key: 'workspace.agent' },
  { mode: 'tasks', icon: 'i-mdi-checkbox-marked-outline', key: 'workspace.tasks' },
  { mode: 'directory', icon: 'i-mdi-account-multiple-outline', key: 'workspace.directory' },
  { mode: 'management', icon: 'i-mdi-tune-variant', key: 'workspace.management' },
]
</script>

<template>
  <nav
    class="workspace-rail hidden h-full w-16 shrink-0 flex-col items-center border-r border-line-soft bg-canvas px-2 py-3 text-dim sm:flex"
  >
    <TeaIconButton
      data-testid="workspace-profile"
      class="workspace-rail__button workspace-rail__profile mb-5 overflow-hidden"
      :label="t('workspace.profile')"
      :aria-pressed="activeMode === 'profile'"
      @click="emit('select', 'profile')"
    >
      <TeaAvatar
        size="fill"
        :src="imProfile?.avatarUrl"
        :fallback-src="generatedAvatarUrl"
        :fallback-text="initials"
        fallback-class="bg-muted text-xs text-fg"
      />
    </TeaIconButton>

    <div class="workspace-rail__group flex flex-1 flex-col gap-2">
      <TeaIconButton
        v-for="entry in entries"
        :key="entry.mode"
        class="workspace-rail__button relative"
        :label="t(entry.key)"
        :aria-pressed="activeMode === entry.mode"
        @click="emit('select', entry.mode)"
      >
        <span :class="[entry.icon, 'workspace-rail__icon size-5']" aria-hidden="true" />
        <span
          v-if="entry.mode === 'tasks' && pendingTasks > 0"
          class="workspace-rail__badge absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning"
          aria-hidden="true"
        />
      </TeaIconButton>
    </div>

    <div
      class="workspace-rail__group workspace-rail__utility-group flex w-full flex-col items-center gap-2 border-t border-line-soft pt-3"
    >
      <TeaIconButton
        class="workspace-rail__button disabled:cursor-wait disabled:opacity-50"
        :label="t('workspace.logout')"
        :disabled="logoutPending"
        @click="emit('logout')"
      >
        <span
          :class="logoutPending ? 'i-mdi-loading animate-spin' : 'i-mdi-logout'"
          class="workspace-rail__icon size-5"
          aria-hidden="true"
        />
      </TeaIconButton>

      <TeaIconButton
        class="workspace-rail__button"
        :label="t('workspace.settings')"
        :aria-pressed="activeMode === 'settings'"
        @click="emit('select', 'settings')"
      >
        <span class="i-mdi-cog-outline workspace-rail__icon size-5" aria-hidden="true" />
      </TeaIconButton>
    </div>
  </nav>
</template>

<style scoped>
.workspace-rail {
  width: 56px;
  padding: 12px 8px;
}

.workspace-rail__button {
  width: 36px;
  height: 36px;
}

.workspace-rail__profile {
  margin-bottom: 20px;
}

.workspace-rail__group {
  gap: 8px;
}

.workspace-rail__utility-group {
  padding-top: 12px;
}

.workspace-rail__icon {
  width: 20px;
  height: 20px;
}

.workspace-rail__badge {
  width: 6px;
  height: 6px;
}

.workspace-rail__button[aria-pressed='true'] {
  border-color: var(--tea-line-strong);
  background: var(--tea-muted);
  color: var(--tea-fg);
}

.workspace-rail__profile:not([aria-pressed='true']) {
  border-color: var(--tea-line);
  background: var(--tea-canvas);
  color: var(--tea-fg);
}

.workspace-rail__button:focus-visible {
  outline-width: 1px;
  outline-color: var(--tea-fg);
  outline-offset: 0;
}
</style>
