<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaInput } from '@/shared/ui'

import type { Channel, ChannelRef, ChannelStatus, ChannelUserProfile } from '../contracts'
import ChannelAvatar from './ChannelAvatar.vue'

const props = defineProps<{
  channels: Channel[]
  activeRef: ChannelRef | null
  status: ChannelStatus
  loading: boolean
  searchQuery?: string
  userProfiles?: ReadonlyMap<string, ChannelUserProfile>
}>()

const emit = defineEmits<{
  select: [channelRef: ChannelRef]
  'update:searchQuery': [value: string]
}>()
const { t } = useI18n()
const localQuery = ref('')
const query = computed({
  get: () => props.searchQuery ?? localQuery.value,
  set: (value: string) => {
    if (props.searchQuery === undefined) localQuery.value = value
    else emit('update:searchQuery', value)
  },
})
const filteredChannels = computed(() => {
  const value = query.value.trim().toLocaleLowerCase()
  if (!value) return props.channels
  return props.channels.filter((channel) =>
    `${channel.name} ${channel.description}`.toLocaleLowerCase().includes(value),
  )
})

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value)
}

function profileFor(channel: Channel): ChannelUserProfile | null {
  const accountId = channel.participantAccountId?.trim()
  return accountId ? (props.userProfiles?.get(accountId) ?? null) : null
}
</script>

<template>
  <aside
    class="hidden h-full w-[288px] shrink-0 flex-col border-r border-line-soft bg-canvas sm:flex"
    :aria-label="t('channels.title')"
  >
    <div
      v-if="searchQuery === undefined"
      class="border-b border-line-soft bg-canvas px-3 pb-3 pt-4 sm:px-4"
    >
      <div class="channel-search-wrap relative">
        <TeaInput
          v-model="query"
          class="pr-10"
          type="search"
          size="small"
          :label="t('channels.search')"
          :placeholder="t('channels.search')"
          :disabled="loading && channels.length === 0"
        />
        <span
          role="img"
          class="channel-sidebar__status pointer-events-none absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full"
          :class="
            loading && channels.length === 0
              ? 'animate-pulse bg-muted motion-reduce:animate-none'
              : status.phase === 'connected'
                ? 'bg-success'
                : status.phase === 'failed' || status.phase === 'kickedOffline'
                  ? 'bg-danger'
                  : 'bg-muted'
          "
          :aria-label="
            loading && channels.length === 0
              ? t('channels.loading')
              : t(`channels.connection.${status.phase}`)
          "
          :title="
            loading && channels.length === 0
              ? t('channels.loading')
              : t(`channels.connection.${status.phase}`)
          "
        />
      </div>
    </div>

    <div class="channel-list-scroll-area flex-1 overflow-y-auto bg-canvas px-2 pb-2 pt-3">
      <div
        v-if="loading && channels.length === 0"
        class="pt-0.5"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="sr-only">{{ t('channels.loading') }}</span>
        <div aria-hidden="true">
          <div
            v-for="index in 6"
            :key="index"
            class="channel-row mb-1 min-h-12 w-full animate-pulse items-center gap-2 px-3.5 py-1.5 motion-reduce:animate-none"
            :style="{ animationDelay: `${(index - 1) * 80}ms` }"
          >
            <span class="size-8 shrink-0 rounded-full bg-muted" />
            <span class="min-w-0 space-y-2">
              <span
                class="block h-2.5 rounded-full bg-muted"
                :class="index % 3 === 0 ? 'w-20' : index % 2 === 0 ? 'w-28' : 'w-24'"
              />
              <span
                class="block h-2 rounded-full bg-panel"
                :class="index % 2 === 0 ? 'w-32' : 'w-36'"
              />
            </span>
            <span class="h-2 w-9 justify-self-end rounded-full bg-panel" />
          </div>
        </div>
      </div>
      <template v-else>
        <TeaButton
          v-for="(channel, index) in filteredChannels"
          :key="channel.ref"
          appearance="ghost"
          size="small"
          class="channel-row group mb-1 min-h-12 w-full animate-fade-slide items-center gap-2 overflow-hidden px-3.5 py-1.5 text-left"
          :class="channel.ref === activeRef ? 'channel-row--active' : 'hover:bg-hover'"
          :aria-pressed="channel.ref === activeRef"
          :style="{ animationDelay: `${index * 35}ms` }"
          @click="emit('select', channel.ref)"
        >
          <ChannelAvatar
            :channel-ref="channel.ref"
            :name="channel.name"
            :avatar-url="channel.avatarUrl"
            :account-id="channel.participantAccountId"
            :user-profile="profileFor(channel)"
          />
          <span class="channel-row__details min-w-0">
            <span
              class="block truncate text-sm leading-5 text-fg"
              :class="channel.unreadCount ? 'font-semibold' : 'font-medium'"
              >{{ channel.name }}</span
            >
            <span
              class="channel-row__preview mt-0.5 block truncate text-xs leading-4"
              :class="channel.unreadCount ? 'text-dim' : 'text-subtle'"
              >{{ channel.lastMessagePreview || channel.description }}</span
            >
          </span>
          <span class="grid h-full min-w-0 content-center justify-items-end gap-1">
            <span class="whitespace-nowrap text-xs tabular-nums text-subtle">{{
              formatTime(channel.updatedAt)
            }}</span>
            <span
              v-if="channel.unreadCount"
              class="flex h-4 min-w-4 items-center justify-center rounded-full bg-inverse px-1 text-xs font-semibold tabular-nums text-on-inverse"
            >
              {{ channel.unreadCount > 99 ? '99+' : channel.unreadCount }}
            </span>
          </span>
        </TeaButton>

        <p
          v-if="!loading && filteredChannels.length === 0"
          class="px-3 py-6 text-center text-sm text-subtle"
        >
          {{ t('channels.noResults') }}
        </p>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.channel-row {
  display: grid;
  block-size: 3.25rem;
  grid-template-columns: 2rem minmax(0, 1fr) 3.75rem;
  min-block-size: 3.25rem;
  border-radius: var(--tea-radius-inline);
  padding-inline: 0.875rem;
}

.channel-row__details {
  display: flex;
  min-block-size: 2.375rem;
  flex-direction: column;
  justify-content: center;
}

.channel-row__preview {
  min-block-size: 1rem;
}

.channel-row--active {
  background: var(--tea-muted);
  color: var(--tea-fg);
}
</style>
