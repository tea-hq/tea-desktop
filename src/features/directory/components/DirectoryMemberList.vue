<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import TeaEmptyState from '@/shared/ui/TeaEmptyState.vue'
import type { DirectoryPhase, DirectoryUser } from '../contracts'
import { directoryUserInitials, isDirectoryMessagingReady } from '../directoryPresentation'

defineProps<{
  users: DirectoryUser[]
  phase: DirectoryPhase
  selectedUserId: string | null
}>()

const emit = defineEmits<{
  select: [user: DirectoryUser]
}>()

const { t } = useI18n()

function selectWithKeyboard(event: KeyboardEvent, user: DirectoryUser): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('select', user)
}
</script>

<template>
  <section
    class="min-h-0 flex-1 overflow-y-auto"
    :aria-busy="phase === 'loading' || undefined"
    :aria-label="t('directory.memberList')"
  >
    <div v-if="phase === 'loading'" role="status" :aria-label="t('directory.loading')">
      <span class="sr-only">{{ t('directory.loading') }}</span>
      <div
        v-for="index in 6"
        :key="index"
        class="grid min-h-[68px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line-soft px-5 sm:grid-cols-[minmax(14rem,1.4fr)_minmax(11rem,1fr)_8rem] sm:px-6"
        data-testid="directory-loading-row"
      >
        <div class="flex min-w-0 items-center gap-3" aria-hidden="true">
          <span
            class="size-10 shrink-0 animate-pulse rounded-full bg-panel motion-reduce:animate-none"
          />
          <span
            class="h-3.5 w-32 animate-pulse rounded-inline bg-panel motion-reduce:animate-none"
          />
        </div>
        <span
          class="hidden h-3.5 w-40 animate-pulse rounded-inline bg-panel motion-reduce:animate-none sm:block"
          aria-hidden="true"
        />
        <span
          class="h-3.5 w-16 animate-pulse rounded-inline bg-panel motion-reduce:animate-none"
          aria-hidden="true"
        />
      </div>
    </div>

    <TeaEmptyState
      v-else-if="phase === 'ready' && users.length === 0"
      data-testid="directory-empty"
      :title="t('directory.empty')"
      icon="i-mdi-account-search-outline"
    />

    <div v-else-if="users.length" role="table" :aria-label="t('directory.memberList')">
      <div
        class="sticky top-0 z-10 hidden min-h-10 grid-cols-[minmax(14rem,1.4fr)_minmax(11rem,1fr)_8rem] items-center border-b border-line-soft bg-canvas px-6 text-xs font-semibold text-subtle sm:grid"
        role="row"
      >
        <span role="columnheader">{{ t('directory.member') }}</span>
        <span role="columnheader">{{ t('directory.email') }}</span>
        <span role="columnheader">{{ t('directory.messaging') }}</span>
      </div>

      <div role="rowgroup">
        <div
          v-for="user in users"
          :key="user.center.userId"
          :aria-label="t('directory.viewProfile', { name: user.center.displayName })"
          :aria-selected="selectedUserId === user.center.userId"
          class="group grid min-h-[68px] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line-soft px-5 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus motion-reduce:transition-none sm:grid-cols-[minmax(14rem,1.4fr)_minmax(11rem,1fr)_8rem] sm:px-6"
          :class="selectedUserId === user.center.userId ? 'bg-panel' : 'bg-canvas'"
          data-testid="directory-member-row"
          role="row"
          tabindex="0"
          @click="emit('select', user)"
          @keydown="selectWithKeyboard($event, user)"
        >
          <div class="flex min-w-0 items-center gap-3" role="cell">
            <span
              class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-semibold"
              :class="
                selectedUserId === user.center.userId
                  ? 'border-line-strong bg-canvas text-fg'
                  : 'border-transparent bg-panel text-dim'
              "
              aria-hidden="true"
            >
              <img
                v-if="user.oidc.avatarUrl"
                :src="user.oidc.avatarUrl"
                alt=""
                class="size-full object-cover"
                referrerpolicy="no-referrer"
              />
              <span v-else>{{ directoryUserInitials(user.center.displayName) }}</span>
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-fg">
                {{ user.center.displayName }}
              </span>
              <span class="mt-0.5 block truncate text-xs text-subtle">
                {{ user.oidc.preferredUsername || user.center.userId }}
              </span>
            </span>
          </div>

          <span class="hidden min-w-0 truncate text-sm text-dim sm:block" role="cell">
            {{ user.oidc.email || t('directory.notProvided') }}
          </span>

          <span
            class="flex items-center justify-end gap-2 text-xs text-dim sm:justify-start"
            role="cell"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="isDirectoryMessagingReady(user) ? 'bg-success' : 'bg-disabled'"
              aria-hidden="true"
            />
            <span class="hidden sm:inline">
              {{
                isDirectoryMessagingReady(user)
                  ? t('directory.messagingReady')
                  : t('directory.messagingUnavailable')
              }}
            </span>
            <span class="i-mdi-chevron-right size-4 text-subtle sm:hidden" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
