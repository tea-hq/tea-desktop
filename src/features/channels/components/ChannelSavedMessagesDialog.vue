<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { MessageContent, SavedMessage } from '../contracts'
import { TeaButton, TeaDialog, TeaIconButton } from '@/shared/ui'

defineProps<{
  open: boolean
  items: SavedMessage[]
  totalCount: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  errorCode: string | null
  removingId: string | null
}>()

const emit = defineEmits<{
  close: []
  retry: []
  loadMore: []
  select: [item: SavedMessage]
  forward: [item: SavedMessage]
  stageAgent: [item: SavedMessage]
  remove: [item: SavedMessage]
}>()

const { locale, t } = useI18n()

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function contentIcon(content: MessageContent): string {
  if (content.kind === 'image') return 'i-mdi-image-outline'
  if (content.kind === 'audio') return 'i-mdi-volume-high'
  if (content.kind === 'video') return 'i-mdi-video-outline'
  if (content.kind === 'file') return 'i-mdi-file-outline'
  if (content.kind === 'location') return 'i-mdi-map-marker-outline'
  return 'i-mdi-message-text-outline'
}

function preview(item: SavedMessage): string {
  const { content, text } = item.message
  if (content.kind === 'file') return content.media.name || text || t('channels.saved.file')
  if (content.kind === 'image') return content.caption || text || t('channels.saved.image')
  if (content.kind === 'audio') return content.caption || text || t('channels.saved.audio')
  if (content.kind === 'video') return content.caption || text || t('channels.saved.video')
  return text || t('channels.messageSearch.noText')
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="t('channels.saved.title')"
    :close-label="t('common.close')"
    width="large"
    dismissable
    @close="emit('close')"
  >
    <p class="text-xs text-subtle">
      {{ t('channels.saved.count', { count: totalCount }) }}
    </p>

    <div v-if="loading && items.length === 0" class="flex justify-center py-10">
      <span class="i-mdi-loading size-5 animate-spin text-subtle" aria-hidden="true" />
      <span class="sr-only">{{ t('channels.saved.loading') }}</span>
    </div>
    <div v-else-if="errorCode && items.length === 0" class="py-8 text-center">
      <p class="text-sm text-danger">{{ t('channels.saved.error', { code: errorCode }) }}</p>
      <TeaButton class="mt-3" size="small" @click="emit('retry')">
        {{ t('channels.connection.retry') }}
      </TeaButton>
    </div>
    <div v-else-if="items.length === 0" class="py-10 text-center text-sm text-subtle">
      {{ t('channels.saved.empty') }}
    </div>
    <div v-else class="mt-3 divide-y divide-line-soft border-y border-line-soft">
      <div v-if="errorCode" class="flex items-center gap-3 py-3 text-sm text-danger">
        <span class="min-w-0 flex-1 truncate">{{
          t('channels.saved.error', { code: errorCode })
        }}</span>
        <TeaButton size="small" @click="emit('retry')">
          {{ t('channels.connection.retry') }}
        </TeaButton>
      </div>
      <div v-for="item in items" :key="item.id" class="py-3">
        <TeaButton
          appearance="ghost"
          fluid
          class="flex min-w-0 items-start gap-3 px-2 py-1 text-left"
          @click="emit('select', item)"
        >
          <span
            :class="contentIcon(item.message.content)"
            class="mt-0.5 size-4 shrink-0 text-subtle"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-3">
              <span class="truncate text-sm font-medium text-fg">{{
                item.message.sender.name
              }}</span>
              <span class="shrink-0 text-xs tabular-nums text-subtle">{{
                formatTime(item.savedAt)
              }}</span>
            </span>
            <span class="mt-1 block truncate text-sm text-dim">{{ preview(item) }}</span>
            <span class="mt-0.5 block truncate text-xs text-subtle">
              {{
                t('channels.saved.from', {
                  channel: item.sourceChannelName || item.message.ref.channelRef,
                })
              }}
            </span>
          </span>
        </TeaButton>
        <div class="mt-1 flex justify-end gap-1 px-2">
          <TeaIconButton
            size="small"
            :label="t('channels.saved.openSource')"
            icon="i-mdi-open-in-new"
            @click="emit('select', item)"
          />
          <TeaIconButton
            size="small"
            :label="t('channels.message.forward')"
            icon="i-mdi-forward"
            @click="emit('forward', item)"
          />
          <TeaIconButton
            size="small"
            :label="t('channels.saved.stageAgent')"
            icon="i-mdi-creation-outline"
            @click="emit('stageAgent', item)"
          />
          <TeaIconButton
            size="small"
            :label="t('channels.saved.remove')"
            :icon="removingId === item.id ? 'i-mdi-loading' : 'i-mdi-bookmark-remove-outline'"
            :disabled="removingId !== null"
            @click="emit('remove', item)"
          />
        </div>
      </div>
      <div v-if="hasMore" class="flex justify-center py-3">
        <TeaButton size="small" :loading="loadingMore" @click="emit('loadMore')">
          {{ t('channels.saved.loadMore') }}
        </TeaButton>
      </div>
    </div>
  </TeaDialog>
</template>
