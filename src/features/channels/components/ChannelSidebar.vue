<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaInput } from '@/shared/ui'

import type { Channel, ChannelRef, ChannelStatus } from '../contracts'
import ChannelAvatar from './ChannelAvatar.vue'

const props = defineProps<{
  channels: Channel[]
  activeRef: ChannelRef | null
  status: ChannelStatus
}>()

const emit = defineEmits<{
  select: [channelRef: ChannelRef]
}>()
const { t } = useI18n()
const query = ref('')
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
</script>

<template>
  <aside
    class="hidden h-full w-[288px] shrink-0 flex-col border-r border-line-soft bg-panel sm:flex"
  >
    <div class="px-2 pb-1.5 pt-3">
      <div class="flex h-7 items-center gap-2">
        <h1 class="truncate text-lg font-semibold text-fg">{{ t('channels.title') }}</h1>
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="
            status.phase === 'connected'
              ? 'bg-success'
              : status.phase === 'failed' || status.phase === 'kickedOffline'
                ? 'bg-danger'
                : 'bg-muted'
          "
          :title="t(`channels.connection.${status.phase}`)"
        />
      </div>
      <TeaInput
        v-model="query"
        class="mt-2"
        type="search"
        size="small"
        :label="t('channels.search')"
        :placeholder="t('channels.search')"
      />
    </div>

    <div
      class="channel-list-scroll-area flex-1 overflow-y-auto border-t border-line-soft bg-canvas px-2 pb-2 pt-3"
    >
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
        />
        <span class="min-w-0">
          <span
            class="block truncate text-sm leading-5 text-fg"
            :class="channel.unreadCount ? 'font-semibold' : 'font-medium'"
            >{{ channel.name }}</span
          >
          <span
            class="mt-0.5 block truncate text-xs leading-4"
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
            class="flex h-4 min-w-4 items-center justify-center rounded-full bg-inverse px-1 text-xs font-semibold tabular-nums text-canvas"
          >
            {{ channel.unreadCount > 99 ? '99+' : channel.unreadCount }}
          </span>
        </span>
      </TeaButton>

      <p v-if="filteredChannels.length === 0" class="px-3 py-6 text-center text-sm text-subtle">
        {{ t('channels.noResults') }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.channel-row {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) 3.75rem;
  border-radius: var(--tea-radius-inline);
  padding-inline: 0.875rem;
}

.channel-row--active {
  background: var(--tea-muted);
  color: var(--tea-fg);
}
</style>
