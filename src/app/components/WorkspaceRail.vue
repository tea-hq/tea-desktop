<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaIconButton } from '@/shared/ui'

export type WorkspaceMode = 'channels' | 'agent' | 'directory' | 'management' | 'profile' | 'settings'

const props = defineProps<{
  activeMode: WorkspaceMode
  pendingTasks: number
  logoutPending: boolean
  user: {
    displayName: string
    preferredUsername: string
    avatarUrl: string
  } | null
}>()

const emit = defineEmits<{
  select: [mode: WorkspaceMode]
  logout: []
}>()
const { t } = useI18n()
const avatarFailed = ref(false)
const initials = computed(() => Array.from(props.user?.displayName || props.user?.preferredUsername || 'T')
  .slice(0, 2).join('').toLocaleUpperCase())

watch(() => props.user?.avatarUrl, () => { avatarFailed.value = false })

const entries: Array<{ mode: WorkspaceMode; icon: string; key: string }> = [
  { mode: 'channels', icon: 'i-mdi-message-text-outline', key: 'workspace.channels' },
  { mode: 'agent', icon: 'i-mdi-creation-outline', key: 'workspace.agent' },
  { mode: 'directory', icon: 'i-mdi-account-multiple-outline', key: 'workspace.directory' },
  { mode: 'management', icon: 'i-mdi-tune-variant', key: 'workspace.management' },
]
</script>

<template>
  <nav class="flex h-full w-14 shrink-0 flex-col items-center tea-bg-inverse py-3 tea-fg-subtle">
    <TeaIconButton
      data-testid="workspace-profile"
      class="mb-5 overflow-hidden"
      :class="activeMode === 'profile' ? 'tea-selected-ring tea-selected-ring tea-selected-ring tea-selected-ring' : 'hover:opacity-80'"
      :label="t('workspace.profile')"
      :aria-pressed="activeMode === 'profile'"
      @click="emit('select', 'profile')"
    >
      <img
        v-if="user?.avatarUrl && !avatarFailed"
        :src="user.avatarUrl"
        :alt="user.displayName"
        class="size-full object-cover"
        referrerpolicy="no-referrer"
        @error="avatarFailed = true"
      />
      <span v-else class="flex size-full items-center justify-center tea-bg-inverse tea-text-micro tea-weight-strong tea-fg-inverse">
        {{ initials }}
      </span>
    </TeaIconButton>

    <div class="flex flex-1 flex-col gap-1.5">
      <TeaIconButton
        v-for="entry in entries"
        :key="entry.mode"
        class="relative"
        :class="activeMode === entry.mode ? 'tea-bg-canvas tea-fg' : 'tea-hover-bg-inverse tea-hover-fg-inverse'"
        :label="t(entry.key)"
        :aria-pressed="activeMode === entry.mode"
        @click="emit('select', entry.mode)"
      >
        <span :class="[entry.icon, 'size-5']" aria-hidden="true" />
        <span
          v-if="entry.mode === 'agent' && pendingTasks > 0"
          class="absolute right-1 top-1 size-1.5 tea-radius-pill tea-bg-warning"
          aria-hidden="true"
        />
      </TeaIconButton>
    </div>

    <TeaIconButton
      class="mb-1.5 disabled:cursor-wait disabled:opacity-50"
      :label="t('workspace.logout')"
      :disabled="logoutPending"
      @click="emit('logout')"
    >
      <span :class="logoutPending ? 'i-mdi-loading animate-spin' : 'i-mdi-logout'" class="size-5" aria-hidden="true" />
    </TeaIconButton>

    <TeaIconButton
      :class="activeMode === 'settings' ? 'tea-bg-canvas tea-fg' : 'tea-hover-bg-inverse tea-hover-fg-inverse'"
      :label="t('workspace.settings')"
      :aria-pressed="activeMode === 'settings'"
      @click="emit('select', 'settings')"
    >
      <span class="i-mdi-cog-outline size-5" aria-hidden="true" />
    </TeaIconButton>

  </nav>
</template>
