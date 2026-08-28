<script setup lang="ts">
import { TeaButton, TeaIconButton, TeaInput } from '@/shared/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DirectoryPhase, DirectoryUser } from '../contracts'
defineProps<{
  users: DirectoryUser[]
  phase: DirectoryPhase
  errorKey: string | null
  query: string
  actionError?: string | null
}>()
const emit = defineEmits<{
  'update:query': [value: string]
  retry: []
  refresh: []
  message: [user: DirectoryUser]
}>()
const { t } = useI18n()
const selectedUser = ref<DirectoryUser | null>(null)

function messageSelectedUser(): void {
  if (!selectedUser.value) return
  emit('message', selectedUser.value)
  selectedUser.value = null
}
</script>

<template>
  <main class="flex h-full min-w-0 flex-1 flex-col bg-canvas">
    <header class="flex items-center justify-between px-5 pb-5 pt-8 sm:px-8">
      <div>
        <p class="text-sm font-medium text-subtle">
          {{ t('directory.eyebrow') }}
        </p>
        <h1 class="mt-1 text-4xl font-semibold text-fg">{{ t('directory.title') }}</h1>
      </div>
      <span class="text-base text-dim">{{ users.length }} {{ t('directory.people') }}</span>
    </header>
    <div class="flex gap-2 px-5 pb-5 sm:px-8">
      <TeaInput
        :model-value="query"
        class="w-full max-w-md"
        type="search"
        :label="t('directory.search')"
        :placeholder="t('directory.search')"
        @update:model-value="emit('update:query', $event)"
      /><TeaIconButton
        :label="t('directory.refresh')"
        icon="i-mdi-refresh"
        appearance="secondary"
        :disabled="phase === 'loading'"
        @click="emit('refresh')"
      />
    </div>
    <div v-if="phase === 'loading'" class="px-8 py-10 text-base text-dim">
      {{ t('directory.loading') }}
    </div>
    <div
      v-else-if="phase === 'error' || phase === 'unavailable'"
      class="mx-5 rounded-card bg-danger-subtle px-4 py-3 text-base text-danger sm:mx-8"
    >
      <span>{{ t(errorKey ?? 'directory.errors.loadFailed') }}</span
      ><TeaButton class="ml-3 font-semibold underline" @click="emit('retry')">{{
        t('directory.retry')
      }}</TeaButton>
    </div>
    <div
      v-else-if="phase === 'stale'"
      class="mx-5 mb-4 rounded-card bg-warning-subtle px-4 py-3 text-base text-warning sm:mx-8"
    >
      {{ t('directory.stale') }}
      <TeaButton class="ml-3 font-semibold underline" @click="emit('retry')">{{
        t('directory.retry')
      }}</TeaButton>
    </div>
    <div
      v-if="actionError"
      class="mx-5 mb-4 rounded-card bg-danger-subtle px-4 py-3 text-base text-danger sm:mx-8"
    >
      {{ t(actionError) }}
    </div>
    <div v-if="phase !== 'loading' && users.length === 0" class="px-8 py-10 text-base text-dim">
      {{ t('directory.empty') }}
    </div>
    <ul v-else class="grid min-w-0 grid-cols-1 gap-px overflow-auto bg-panel md:grid-cols-2">
      <li
        v-for="user in users"
        :key="user.center.userId"
        class="flex min-w-0 items-center gap-3 bg-muted px-8 py-4"
      >
        <TeaButton
          appearance="ghost"
          class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel p-0 text-base font-semibold text-dim"
          :aria-label="t('directory.viewProfile', { name: user.center.displayName })"
          @click="selectedUser = user"
          ><img
            v-if="user.oidc.avatarUrl"
            :src="user.oidc.avatarUrl"
            :alt="user.center.displayName"
            class="size-full object-cover"
            referrerpolicy="no-referrer"
          /><span v-else>{{ user.center.displayName.slice(0, 2).toUpperCase() }}</span></TeaButton
        ><TeaButton
          appearance="ghost"
          class="min-w-0 flex-1 justify-start px-0 text-left"
          @click="selectedUser = user"
          ><p class="truncate text-base font-semibold text-fg">
            {{ user.center.displayName }}
          </p>
          <p class="truncate text-sm text-dim">
            {{ user.oidc.preferredUsername || user.center.userId }}
          </p></TeaButton
        >
      </li>
    </ul>
    <div
      v-if="selectedUser"
      class="fixed inset-0 z-20 flex items-center justify-center bg-inverse/30 p-6"
      @click.self="selectedUser = null"
    >
      <section class="w-full max-w-sm rounded-overlay border border-line bg-canvas p-6">
        <div class="flex items-center gap-3">
          <div
            class="flex size-14 items-center justify-center overflow-hidden rounded-full bg-panel text-xl font-semibold text-dim"
          >
            <img
              v-if="selectedUser.oidc.avatarUrl"
              :src="selectedUser.oidc.avatarUrl"
              :alt="selectedUser.center.displayName"
              class="size-full object-cover"
              referrerpolicy="no-referrer"
            /><span v-else>{{ selectedUser.center.displayName.slice(0, 2).toUpperCase() }}</span>
          </div>
          <div>
            <h2 class="font-sans text-xl text-fg">{{ selectedUser.center.displayName }}</h2>
            <p class="text-base text-dim">
              {{ selectedUser.oidc.preferredUsername || selectedUser.center.userId }}
            </p>
          </div>
        </div>
        <dl class="mt-5 space-y-2 text-base">
          <div v-if="selectedUser.oidc.email">
            <dt class="text-sm text-subtle">{{ t('directory.email') }}</dt>
            <dd class="text-fg">{{ selectedUser.oidc.email }}</dd>
          </div>
          <div>
            <dt class="text-sm text-subtle">{{ t('directory.account') }}</dt>
            <dd class="text-fg">{{ selectedUser.im?.account || t('directory.notAvailable') }}</dd>
          </div>
        </dl>
        <div class="mt-6 flex justify-end gap-2">
          <TeaIconButton
            :label="t('directory.close')"
            icon="i-mdi-close"
            @click="selectedUser = null"
          /><TeaIconButton
            :label="t('directory.sendMessage')"
            icon="i-mdi-message-text-outline"
            appearance="primary"
            :disabled="selectedUser.im?.status !== 'ready' || !selectedUser.im?.account"
            @click="messageSelectedUser"
          />
        </div>
      </section>
    </div>
  </main>
</template>
