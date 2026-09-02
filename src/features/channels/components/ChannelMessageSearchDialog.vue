<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Channel, Message, MessageSearchState } from '../contracts'
import { TeaButton, TeaDialog, TeaInput } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  channelName: string
  channels: Channel[]
  state: MessageSearchState
}>()

const emit = defineEmits<{
  close: []
  search: [keyword: string]
  loadMore: []
  select: [message: Message]
}>()

const { t } = useI18n()
const keyword = ref('')

watch(
  () => [props.open, props.state.query] as const,
  ([open, query]) => {
    if (open) keyword.value = query
  },
  { immediate: true },
)

function submit(): void {
  const value = keyword.value.trim()
  if (value) emit('search', value)
}

function displayText(message: Message): string {
  return message.text || t('channels.messageSearch.noText')
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function channelNameFor(message: Message): string {
  return (
    props.channels.find((channel) => channel.ref === message.ref.channelRef)?.name ??
    message.ref.channelRef
  )
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="t('channels.messageSearch.title')"
    width="large"
    dismissable
    @close="emit('close')"
  >
    <form class="flex items-end gap-2" @submit.prevent="submit">
      <TeaInput
        v-model="keyword"
        class="min-w-0 flex-1"
        type="search"
        :label="t('channels.messageSearch.inputLabel')"
        :placeholder="t('channels.messageSearch.placeholder', { channel: channelName })"
        :disabled="state.loading"
      />
      <TeaButton type="submit" appearance="primary" :disabled="!keyword.trim() || state.loading">
        {{ t('channels.messageSearch.submit') }}
      </TeaButton>
    </form>

    <div class="mt-4 flex items-center justify-between gap-3 text-xs text-subtle">
      <span v-if="state.query">
        {{ t('channels.messageSearch.resultCount', { count: state.totalCount }) }}
      </span>
      <span v-else>{{ t('channels.messageSearch.emptyPrompt') }}</span>
      <span v-if="state.query && state.channelRef" class="truncate">
        {{ t('channels.messageSearch.scope', { channel: channelName }) }}
      </span>
      <span v-else-if="state.query" class="truncate">
        {{ t('channels.messageSearch.globalScope') }}
      </span>
    </div>

    <div v-if="state.errorCode" class="mt-3 text-sm text-danger" role="alert">
      {{ t('channels.messageSearch.error', { code: state.errorCode }) }}
    </div>

    <div v-if="state.loading && state.items.length === 0" class="flex justify-center py-10">
      <span class="i-mdi-loading size-5 animate-spin text-subtle" aria-hidden="true" />
      <span class="sr-only">{{ t('channels.messageSearch.loading') }}</span>
    </div>
    <div
      v-else-if="state.query && state.items.length === 0"
      class="py-10 text-center text-sm text-subtle"
    >
      {{ t('channels.messageSearch.noResults') }}
    </div>
    <div
      v-else-if="state.items.length"
      class="mt-3 divide-y divide-line-soft border-y border-line-soft"
    >
      <TeaButton
        v-for="message in state.items"
        :key="`${message.ref.channelRef}:${message.ref.messageServerId || message.ref.messageClientId}`"
        appearance="ghost"
        fluid
        class="flex min-w-0 items-start gap-3 px-2 py-3 text-left"
        @click="emit('select', message)"
      >
        <span
          class="mt-0.5 size-7 shrink-0 rounded-full bg-muted text-center text-xs font-semibold leading-7 text-dim"
        >
          {{ [...message.sender.name].slice(0, 2).join('').toUpperCase() }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="truncate text-sm font-medium text-fg">{{ message.sender.name }}</span>
            <span class="shrink-0 text-xs tabular-nums text-subtle">{{
              formatTime(message.sentAt)
            }}</span>
          </span>
          <span class="mt-1 block truncate text-sm text-dim">{{ displayText(message) }}</span>
          <span v-if="!state.channelRef" class="mt-0.5 block truncate text-xs text-subtle">
            {{ channelNameFor(message) }}
          </span>
        </span>
      </TeaButton>
    </div>

    <div v-if="state.hasMore" class="mt-4 flex justify-center">
      <TeaButton
        appearance="ghost"
        size="small"
        :disabled="state.loading"
        @click="emit('loadMore')"
      >
        {{
          state.loading
            ? t('channels.messageSearch.loadingMore')
            : t('channels.messageSearch.loadMore')
        }}
      </TeaButton>
    </div>
  </TeaDialog>
</template>
