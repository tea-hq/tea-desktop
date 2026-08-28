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
  <main class="flex h-full min-w-0 flex-1 flex-col tea-bg-canvas">
    <header class="flex items-center justify-between px-8 pb-5 pt-8">
      <div>
        <p class="tea-text-caption tea-weight-strong uppercase tea-tracking-label tea-fg-subtle">
          {{ t('directory.eyebrow') }}
        </p>
        <h1 class="mt-1 tea-font-ui tea-text-display tea-fg">{{ t('directory.title') }}</h1>
      </div>
      <span class="tea-text-body tea-fg-muted">{{ users.length }} {{ t('directory.people') }}</span>
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
    <div v-if="phase === 'loading'" class="px-8 py-10 tea-text-body tea-fg-muted">
      {{ t('directory.loading') }}
    </div>
    <div
      v-else-if="phase === 'error' || phase === 'unavailable'"
      class="mx-8 tea-radius-control tea-bg-danger-subtle px-4 py-3 tea-text-body tea-fg-danger"
    >
      <span>{{ t(errorKey ?? 'directory.errors.loadFailed') }}</span
      ><TeaButton class="ml-3 tea-weight-strong underline" @click="emit('retry')">{{
        t('directory.retry')
      }}</TeaButton>
    </div>
    <div
      v-else-if="phase === 'stale'"
      class="mx-8 mb-4 tea-radius-control tea-bg-warning-subtle px-4 py-3 tea-text-body tea-fg-warning"
    >
      {{ t('directory.stale') }}
      <TeaButton class="ml-3 tea-weight-strong underline" @click="emit('retry')">{{
        t('directory.retry')
      }}</TeaButton>
    </div>
    <div
      v-if="actionError"
      class="mx-8 mb-4 tea-radius-control tea-bg-danger-subtle px-4 py-3 tea-text-body tea-fg-danger"
    >
      {{ t(actionError) }}
    </div>
    <div
      v-if="phase !== 'loading' && users.length === 0"
      class="px-8 py-10 tea-text-body tea-fg-muted"
    >
      {{ t('directory.empty') }}
    </div>
    <ul v-else class="grid min-w-0 grid-cols-1 gap-px overflow-auto tea-bg-muted md:grid-cols-2">
      <li
        v-for="user in users"
        :key="user.center.userId"
        class="flex min-w-0 items-center gap-3 tea-bg-canvas px-8 py-4"
      >
        <TeaButton
          class="flex size-10 shrink-0 items-center justify-center overflow-hidden tea-radius-control tea-bg-hover tea-text-body tea-weight-strong tea-fg-muted tea-focus-ring tea-focus-ring tea-focus-ring"
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
          ><p class="truncate tea-text-body tea-weight-strong tea-fg">
            {{ user.center.displayName }}
          </p>
          <p class="truncate tea-text-caption tea-fg-muted">
            {{ user.oidc.preferredUsername || user.center.userId }}
          </p></TeaButton
        >
      </li>
    </ul>
    <div
      v-if="selectedUser"
      class="fixed inset-0 z-20 flex items-center justify-center tea-bg-muted p-6"
      @click.self="selectedUser = null"
    >
      <section class="w-full max-w-sm tea-radius-overlay tea-bg-canvas p-6 tea-elevation-overlay">
        <div class="flex items-center gap-3">
          <div
            class="flex size-14 items-center justify-center overflow-hidden tea-radius-control tea-bg-hover tea-text-title tea-weight-strong tea-fg-muted"
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
            <h2 class="tea-font-ui tea-text-title tea-fg">{{ selectedUser.center.displayName }}</h2>
            <p class="tea-text-body tea-fg-muted">
              {{ selectedUser.oidc.preferredUsername || selectedUser.center.userId }}
            </p>
          </div>
        </div>
        <dl class="mt-5 space-y-2 tea-text-body">
          <div v-if="selectedUser.oidc.email">
            <dt class="tea-text-caption tea-fg-subtle">{{ t('directory.email') }}</dt>
            <dd class="tea-fg">{{ selectedUser.oidc.email }}</dd>
          </div>
          <div>
            <dt class="tea-text-caption tea-fg-subtle">{{ t('directory.account') }}</dt>
            <dd class="tea-fg">{{ selectedUser.im?.account || t('directory.notAvailable') }}</dd>
          </div>
        </dl>
        <div class="mt-6 flex justify-end gap-2">
          <TeaButton
            class="flex size-9 items-center justify-center tea-radius-control tea-fg-muted tea-hover-bg"
            :title="t('directory.close')"
            :aria-label="t('directory.close')"
            @click="selectedUser = null"
            ><span class="i-mdi-close size-5" aria-hidden="true" /></TeaButton
          ><TeaButton
            class="flex size-9 items-center justify-center tea-radius-control tea-bg-inverse tea-fg-inverse disabled:cursor-not-allowed disabled:opacity-40"
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
