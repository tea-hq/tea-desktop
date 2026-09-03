<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaDrawer, TeaIconButton, TeaInput, TeaMessageBar } from '@/shared/ui'
import type { DirectoryPhase, DirectoryUser } from '../contracts'
import type { ChannelUserProfile } from '@/features/channels/contracts'
import DirectoryMemberDetail from './DirectoryMemberDetail.vue'
import DirectoryMemberList from './DirectoryMemberList.vue'
import DirectoryScopeNavigation from './DirectoryScopeNavigation.vue'

const props = defineProps<{
  users: DirectoryUser[]
  totalCount: number
  tenantName: string
  phase: DirectoryPhase
  errorKey: string | null
  query: string
  actionError?: string | null
  userProfiles?: ReadonlyMap<string, ChannelUserProfile>
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  retry: []
  refresh: []
  message: [user: DirectoryUser]
}>()

const { t } = useI18n()
const selectedUserId = ref<string | null>(null)
const detailDrawerOpen = ref(false)
const wideDetail = ref(false)
let detailMedia: MediaQueryList | null = null

const selectedUser = computed(
  () => props.users.find((user) => user.center.userId === selectedUserId.value) ?? null,
)

watch(
  () => props.users.map((user) => user.center.userId),
  () => {
    if (selectedUser.value) return
    selectedUserId.value = props.users[0]?.center.userId ?? null
    if (!selectedUserId.value) detailDrawerOpen.value = false
  },
  { immediate: true },
)

function updateDetailMode(event?: MediaQueryListEvent): void {
  wideDetail.value = event?.matches ?? detailMedia?.matches ?? false
  if (wideDetail.value) detailDrawerOpen.value = false
}

function selectUser(user: DirectoryUser): void {
  selectedUserId.value = user.center.userId
  if (!wideDetail.value) detailDrawerOpen.value = true
}

function messageUser(user: DirectoryUser): void {
  emit('message', user)
  detailDrawerOpen.value = false
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  detailMedia = window.matchMedia('(min-width: 1280px)')
  updateDetailMode()
  detailMedia.addEventListener('change', updateDetailMode)
})

onBeforeUnmount(() => detailMedia?.removeEventListener('change', updateDetailMode))
</script>

<template>
  <main class="flex h-full min-w-0 flex-1 flex-col bg-canvas">
    <header
      class="flex min-h-[92px] shrink-0 items-center justify-between gap-5 border-b border-line-soft px-5 py-5 sm:px-6 xl:px-8"
    >
      <div class="min-w-0">
        <h1 class="truncate text-3xl font-semibold text-fg">{{ t('directory.title') }}</h1>
        <p class="mt-1 text-sm tabular-nums text-subtle">
          {{ t('directory.memberCount', { count: totalCount }) }}
        </p>
      </div>
      <TeaIconButton
        :label="t('directory.refresh')"
        :icon="
          phase === 'loading'
            ? 'i-mdi-loading animate-spin motion-reduce:animate-none'
            : 'i-mdi-refresh'
        "
        appearance="secondary"
        :disabled="phase === 'loading'"
        @click="emit('refresh')"
      />
    </header>

    <div class="flex min-h-0 flex-1">
      <DirectoryScopeNavigation :tenant-name="tenantName" :total-count="totalCount" />

      <section class="flex min-w-0 flex-1 flex-col bg-canvas">
        <div class="shrink-0 border-b border-line-soft px-5 py-4 sm:px-6">
          <div class="mb-3 flex min-w-0 items-center gap-2 md:hidden">
            <span class="i-mdi-domain size-4 shrink-0 text-subtle" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-xs font-semibold text-dim">
              {{ tenantName }}
            </span>
            <span class="text-xs tabular-nums text-subtle">
              {{ t('directory.memberCount', { count: totalCount }) }}
            </span>
          </div>

          <div class="flex min-w-0 items-center gap-3">
            <div class="relative min-w-0 flex-1">
              <span
                class="i-mdi-magnify pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-subtle"
                aria-hidden="true"
              />
              <TeaInput
                :model-value="query"
                class="pl-10"
                type="search"
                :label="t('directory.search')"
                :placeholder="t('directory.search')"
                @update:model-value="emit('update:query', $event)"
              />
            </div>
            <span v-if="query.trim()" class="shrink-0 text-xs tabular-nums text-subtle">
              {{ t('directory.resultCount', { count: users.length }) }}
            </span>
          </div>
        </div>

        <div v-if="phase === 'error' || phase === 'unavailable'" class="shrink-0 px-5 pt-4 sm:px-6">
          <TeaMessageBar tone="error">
            <span>{{ t(errorKey ?? 'directory.errors.loadFailed') }}</span>
            <TeaButton
              appearance="ghost"
              size="small"
              class="ml-2 min-h-0 px-1 underline"
              data-testid="directory-retry"
              @click="emit('retry')"
            >
              {{ t('directory.retry') }}
            </TeaButton>
          </TeaMessageBar>
        </div>

        <div v-else-if="phase === 'stale'" class="shrink-0 px-5 pt-4 sm:px-6">
          <TeaMessageBar tone="warning">
            <span>{{ t('directory.stale') }}</span>
            <TeaButton
              appearance="ghost"
              size="small"
              class="ml-2 min-h-0 px-1 underline"
              data-testid="directory-retry"
              @click="emit('retry')"
            >
              {{ t('directory.retry') }}
            </TeaButton>
          </TeaMessageBar>
        </div>

        <div v-if="actionError && !detailDrawerOpen" class="shrink-0 px-5 pt-4 sm:px-6 xl:hidden">
          <TeaMessageBar tone="error">{{ t(actionError) }}</TeaMessageBar>
        </div>

        <DirectoryMemberList
          :users="users"
          :phase="phase"
          :selected-user-id="wideDetail || detailDrawerOpen ? selectedUserId : null"
          :user-profiles="userProfiles"
          @select="selectUser"
        />
      </section>

      <aside class="hidden w-[336px] shrink-0 border-l border-line-soft xl:block">
        <DirectoryMemberDetail
          :user="selectedUser"
          :action-error="actionError"
          :user-profiles="userProfiles"
          @message="messageUser"
        />
      </aside>
    </div>

    <TeaDrawer
      :open="detailDrawerOpen && !wideDetail"
      :title="selectedUser?.center.displayName ?? t('directory.memberDetails')"
      :close-label="t('directory.close')"
      :default-width="380"
      :min-width="320"
      :max-width="420"
      @close="detailDrawerOpen = false"
    >
      <DirectoryMemberDetail
        :user="selectedUser"
        :action-error="actionError"
        :user-profiles="userProfiles"
        @message="messageUser"
      />
    </TeaDrawer>
  </main>
</template>
