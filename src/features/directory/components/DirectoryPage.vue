<script setup lang="ts">
import { TeaButton, TeaInput } from '@/shared/ui'
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
    <header class="flex items-center justify-between px-8 pb-5 pt-8">
      <div>
        <p class="text-sm font-semibold uppercase tracking-normal text-subtle">
          {{ t('directory.eyebrow') }}
        </p>
        <h1 class="mt-1 font-sans text-4xl text-fg">{{ t('directory.title') }}</h1>
      </div>
      <span class="text-base text-dim">{{ users.length }} {{ t('directory.people') }}</span>
    </header>
    <div class="flex gap-2 px-8 pb-5">
      <TeaInput
        :model-value="query"
        class="w-full max-w-md"
        type="search"
        :label="t('directory.search')"
        :placeholder="t('directory.search')"
        @update:model-value="emit('update:query', $event)"
      /><TeaButton
        :aria-label="t('directory.refresh')"
        :disabled="phase === 'loading'"
        @click="emit('refresh')"
        ><span
          class="size-5"
          :class="phase === 'loading' ? 'i-mdi-loading animate-spin' : 'i-mdi-refresh'"
          aria-hidden="true"
      /></TeaButton>
    </div>
    <div v-if="phase === 'loading'" class="px-8 py-10 text-base text-dim">
      {{ t('directory.loading') }}
    </div>
    <div
      v-else-if="phase === 'error' || phase === 'unavailable'"
      class="mx-8 rounded-control bg-danger-subtle px-4 py-3 text-base text-danger"
    >
      <span>{{ t(errorKey ?? 'directory.errors.loadFailed') }}</span
      ><TeaButton class="ml-3 font-semibold underline" @click="emit('retry')">{{
        t('directory.retry')
      }}</TeaButton>
    </div>
    <div
      v-else-if="phase === 'stale'"
      class="mx-8 mb-4 rounded-control bg-warning-subtle px-4 py-3 text-base text-warning"
    >
      {{ t('directory.stale') }}
      <TeaButton class="ml-3 font-semibold underline" @click="emit('retry')">{{
        t('directory.retry')
      }}</TeaButton>
    </div>
    <div
      v-if="actionError"
      class="mx-8 mb-4 rounded-control bg-danger-subtle px-4 py-3 text-base text-danger"
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
        class="flex min-w-0 items-center gap-3 bg-canvas px-8 py-4"
      >
        <TeaButton
          class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-hover text-base font-semibold text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :aria-label="t('directory.viewProfile', { name: user.center.displayName })"
          @click="selectedUser = user"
          ><img
            v-if="user.oidc.avatarUrl"
            :src="user.oidc.avatarUrl"
            :alt="user.center.displayName"
            class="size-full object-cover"
            referrerpolicy="no-referrer"
          /><span v-else>{{ user.center.displayName.slice(0, 2).toUpperCase() }}</span></TeaButton
        ><TeaButton class="min-w-0 flex-1 text-left" @click="selectedUser = user"
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
      class="fixed inset-0 z-20 flex items-center justify-center bg-panel p-6"
      @click.self="selectedUser = null"
    >
      <section class="w-full max-w-sm rounded-overlay bg-canvas p-6 shadow-overlay">
        <div class="flex items-center gap-3">
          <div
            class="flex size-14 items-center justify-center overflow-hidden rounded-control bg-hover text-xl font-semibold text-dim"
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
          <TeaButton
            class="flex size-9 items-center justify-center rounded-control text-dim hover:bg-hover"
            :title="t('directory.close')"
            :aria-label="t('directory.close')"
            @click="selectedUser = null"
            ><span class="i-mdi-close size-5" aria-hidden="true" /></TeaButton
          ><TeaButton
            class="flex size-9 items-center justify-center rounded-control bg-inverse text-canvas disabled:cursor-not-allowed disabled:opacity-40"
            :title="t('directory.sendMessage')"
            :aria-label="t('directory.sendMessage')"
            :disabled="selectedUser.im?.status !== 'ready' || !selectedUser.im?.account"
            @click="messageSelectedUser"
            ><span class="i-mdi-message-text-outline size-5" aria-hidden="true"
          /></TeaButton>
        </div>
      </section>
    </div>
  </main>
</template>
