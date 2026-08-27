<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaIconButton, TeaInput } from '@/shared/ui'

import type { Channel, ChannelRef, ChannelStatus } from '../contracts'
import ChannelAvatar from './ChannelAvatar.vue'

const props = defineProps<{
  channels: Channel[]
  activeRef: ChannelRef | null
  status: ChannelStatus
}>()

const emit = defineEmits<{
  select: [channelRef: ChannelRef]
  disconnect: []
}>()
const { t } = useI18n()
const query = ref('')
const filteredChannels = computed(() => {
  const value = query.value.trim().toLocaleLowerCase()
  if (!value) return props.channels
  return props.channels.filter(channel =>
    `${channel.name} ${channel.description}`.toLocaleLowerCase().includes(value),
  )
})

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value)
}
</script>

<template>
  <aside class="hidden h-full w-[264px] shrink-0 flex-col tea-bg-subtle sm:flex">
    <div class="px-4 pb-2 pt-3.5">
      <div class="flex h-8 items-center justify-between">
        <div class="flex min-w-0 items-center gap-2">
          <h1 class="truncate tea-text-lead tea-weight-strong tea-fg">{{ t('channels.title') }}</h1>
          <span
            class="size-1.5 shrink-0 tea-radius-pill"
            :class="status.phase === 'connected' ? 'tea-bg-success' : status.phase === 'failed' || status.phase === 'kickedOffline' ? 'tea-bg-danger' : 'tea-bg-disabled'"
            :title="t(`channels.connection.${status.phase}`)"
          />
        </div>
        <TeaIconButton v-if="status.phase === 'connected'" size="small" :label="t('channels.connection.disconnect')" icon="i-mdi-logout" @click="emit('disconnect')" />
      </div>
      <TeaInput v-model="query" class="mt-2.5" type="search" size="small" :label="t('channels.search')" :placeholder="t('channels.search')" />
    </div>

    <div class="channel-list-scroll-area flex-1 overflow-y-auto px-2.5 pb-3">
      <div class="flex items-center justify-between px-2 pb-1.5 pt-3">
        <p class="tea-text-micro tea-weight-strong uppercase tea-fg-subtle">{{ t('channels.recent') }}</p>
        <span class="tea-text-micro tabular-nums tea-fg-disabled">{{ filteredChannels.length }}</span>
      </div>
      <TeaButton
        v-for="(channel, index) in filteredChannels"
        :key="channel.ref"
        appearance="ghost"
        size="small"
        class="group mb-0.5 grid min-h-14 w-full animate-fade-slide grid-cols-[2rem_minmax(0,1fr)] items-center gap-2.5 tea-radius-control px-2.5 py-2 text-left transition-colors tea-focus-ring tea-focus-ring tea-focus-ring"
        :class="channel.ref === activeRef ? 'tea-bg-canvas' : 'tea-hover-bg'"
        :style="{ animationDelay: `${index * 35}ms` }"
        @click="emit('select', channel.ref)"
      >
        <ChannelAvatar
          :channel-ref="channel.ref"
          :name="channel.name"
          :avatar-url="channel.avatarUrl"
        />
        <span class="min-w-0 flex-1">
          <span class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
            <span class="truncate tea-text-body tea-fg" :class="channel.unreadCount ? 'tea-weight-strong' : 'tea-weight-medium'">{{ channel.name }}</span>
            <span class="tea-text-micro tabular-nums tea-fg-subtle">{{ formatTime(channel.updatedAt) }}</span>
          </span>
          <span class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span class="truncate tea-text-caption" :class="channel.unreadCount ? 'tea-fg-muted' : 'tea-fg-subtle'">{{ channel.lastMessagePreview || channel.description }}</span>
            <span
              v-if="channel.unreadCount"
              class="flex h-4 min-w-4 items-center justify-center tea-radius-pill tea-bg-inverse px-1 tea-text-micro tea-weight-strong tabular-nums tea-fg-inverse"
            >
              {{ channel.unreadCount > 99 ? '99+' : channel.unreadCount }}
            </span>
          </span>
        </span>
      </TeaButton>

      <p v-if="filteredChannels.length === 0" class="px-3 py-8 text-center tea-text-caption tea-fg-subtle">
        {{ t('channels.noResults') }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.channel-list-scroll-area {
  scrollbar-color: rgb(156 163 175 / 12%) transparent;
  scrollbar-width: thin;
}

.channel-list-scroll-area::-webkit-scrollbar {
  width: 4px;
}

.channel-list-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.channel-list-scroll-area::-webkit-scrollbar-thumb {
  background: rgb(156 163 175 / 12%);
  border-radius: 2px;
}

.channel-list-scroll-area:hover,
.channel-list-scroll-area:focus-within {
  scrollbar-color: rgb(156 163 175 / 28%) transparent;
}

.channel-list-scroll-area:hover::-webkit-scrollbar-thumb,
.channel-list-scroll-area:focus-within::-webkit-scrollbar-thumb {
  background: rgb(156 163 175 / 28%);
}
</style>
