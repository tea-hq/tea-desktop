<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { PinnedMessage } from '../contracts'
import { TeaButton, TeaDialog } from '@/shared/ui'

defineProps<{
  open: boolean
  channelName: string
  items: PinnedMessage[]
  loading: boolean
  errorCode: string | null
}>()

const emit = defineEmits<{
  close: []
  retry: []
  select: [item: PinnedMessage]
}>()

const { locale, t } = useI18n()

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="t('channels.pinned.title')"
    :close-label="t('common.close')"
    width="large"
    dismissable
    @close="emit('close')"
  >
    <p class="text-xs text-subtle">{{ t('channels.pinned.scope', { channel: channelName }) }}</p>

    <div v-if="loading && items.length === 0" class="flex justify-center py-10">
      <span class="i-mdi-loading size-5 animate-spin text-subtle" aria-hidden="true" />
      <span class="sr-only">{{ t('channels.pinned.loading') }}</span>
    </div>
    <div v-else-if="errorCode && items.length === 0" class="py-8 text-center">
      <p class="text-sm text-danger">{{ t('channels.pinned.error', { code: errorCode }) }}</p>
      <TeaButton class="mt-3" size="small" @click="emit('retry')">
        {{ t('channels.connection.retry') }}
      </TeaButton>
    </div>
    <div v-else-if="items.length === 0" class="py-10 text-center text-sm text-subtle">
      {{ t('channels.pinned.empty') }}
    </div>
    <div v-else class="mt-3 divide-y divide-line-soft border-y border-line-soft">
      <TeaButton
        v-for="item in items"
        :key="`${item.message.ref.channelRef}:${item.message.ref.messageServerId || item.message.ref.messageClientId}`"
        appearance="ghost"
        fluid
        class="flex min-w-0 items-start gap-3 px-2 py-3 text-left"
        @click="emit('select', item)"
      >
        <span class="i-mdi-pin-outline mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="truncate text-sm font-medium text-fg">{{ item.message.sender.name }}</span>
            <span class="shrink-0 text-xs tabular-nums text-subtle">{{
              formatTime(item.pinnedAt)
            }}</span>
          </span>
          <span class="mt-1 block truncate text-sm text-dim">
            {{ item.message.text || t('channels.messageSearch.noText') }}
          </span>
          <span v-if="item.pinnedByAccountId" class="mt-0.5 block truncate text-xs text-subtle">
            {{ t('channels.pinned.by', { account: item.pinnedByAccountId }) }}
          </span>
        </span>
      </TeaButton>
    </div>
  </TeaDialog>
</template>
