<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { useI18n } from 'vue-i18n'

import RuntimeIcon from '../../../shared/ui/RuntimeIcon.vue'
import type { ConversationScopeFilter, ConversationSummary, ConversationUiError, RuntimeDescriptor } from '../contracts'

const props = defineProps<{
  conversations: ConversationSummary[]
  activeId: string | null
  runtimes: RuntimeDescriptor[]
  loading: boolean
  loadingMore: boolean
  error: ConversationUiError | null
  hasMore: boolean
  filter: ConversationScopeFilter
}>()

const emit = defineEmits<{
  new: []
  select: [id: string]
  loadMore: []
  retry: []
  filter: [filter: ConversationScopeFilter]
}>()
const { t } = useI18n()

function runtimeName(runtimeId: string): string {
  return props.runtimes.find(runtime => runtime.id === runtimeId)?.displayName ?? runtimeId
}

function conversationTitle(conversation: ConversationSummary): string {
  return conversation.title || t('sidebar.untitled')
}

function errorText(error: ConversationUiError): string {
  return error.kind === 'localized' ? t(error.key, error.params ?? {}) : error.message
}

function handleScroll(event: Event): void {
  const target = event.currentTarget as HTMLElement
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 80 && props.hasMore) {
    emit('loadMore')
  }
}
</script>

<template>
  <aside class="flex flex-col w-[260px] tea-bg-subtle h-full">
    <div class="p-3">
      <TeaButton
        class="flex w-full items-center justify-center gap-2 tea-radius-control tea-bg-inverse px-4 py-2.5 tea-text-body tea-weight-medium tea-fg-inverse transition-colors duration-150 tea-hover-bg-inverse tea-focus-ring tea-focus-ring tea-focus-ring"
        @click="emit('new')"
      >
        <span class="i-mdi-plus size-4" aria-hidden="true" />
        {{ t('sidebar.newConversation') }}
      </TeaButton>
      <div class="mt-2 grid grid-cols-3 gap-1 tea-radius-control tea-bg-muted p-1">
        <TeaButton
          v-for="kind in (['all', 'local', 'channel'] as const)"
          :key="kind"
          class="tea-radius-small px-1.5 py-1 tea-text-micro tea-weight-medium transition-colors"
          :class="filter.kind === kind ? 'tea-bg-canvas tea-fg tea-elevation-low' : 'tea-fg-subtle tea-hover-fg'"
          @click="emit('filter', { kind })"
        >
          {{ t(`sidebar.filters.${kind}`) }}
        </TeaButton>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-3" @scroll.passive="handleScroll">
      <div v-if="loading" class="flex items-center justify-center gap-2 px-3 py-8 tea-text-caption tea-fg-subtle">
        <span class="i-mdi-loading size-4 animate-spin" aria-hidden="true" />
        {{ t('sidebar.loading') }}
      </div>
      <div v-else-if="error" class="px-3 py-6 text-center">
        <p class="tea-text-caption leading-5 tea-fg-danger">{{ errorText(error) }}</p>
        <TeaButton
          class="mt-3 inline-flex items-center gap-1.5 tea-radius-control px-2.5 py-1.5 tea-text-caption tea-weight-medium tea-fg tea-hover-bg-strong tea-focus-ring tea-focus-ring tea-focus-ring"
          @click="emit('retry')"
        >
          <span class="i-mdi-refresh size-3.5" aria-hidden="true" />
          {{ t('sidebar.retry') }}
        </TeaButton>
      </div>
      <p v-else-if="conversations.length === 0" class="px-3 py-8 text-center tea-text-caption tea-fg-subtle">
        {{ t('sidebar.empty') }}
      </p>
      <TeaButton
        v-for="(conv, i) in conversations"
        :key="conv.conversationId"
        class="group mb-1 flex h-10 w-full animate-fade-slide items-center gap-2.5 tea-radius-control px-2.5 text-left transition-colors duration-150 tea-focus-ring tea-focus-ring tea-focus-ring"
        :class="conv.conversationId === activeId ? 'tea-bg-hover' : 'tea-hover-bg'"
        :style="{ animationDelay: `${i * 30}ms` }"
        :aria-label="conversationTitle(conv)"
        :title="conversationTitle(conv)"
        @click="emit('select', conv.conversationId)"
      >
        <RuntimeIcon
          class="transition-colors duration-150"
          :class="conv.conversationId === activeId ? 'tea-fg' : 'tea-fg-subtle tea-group-hover-fg'"
          :runtime-id="conv.runtimeId"
          :label="runtimeName(conv.runtimeId)"
        />
        <span class="min-w-0 flex-1 truncate tea-text-body tea-weight-medium leading-5 tea-fg">
          {{ conversationTitle(conv) }}
        </span>
        <span v-if="conv.channelBinding" class="i-mdi-pound size-3 shrink-0 tea-fg-subtle" aria-hidden="true" />
      </TeaButton>
      <div v-if="loadingMore" class="flex items-center justify-center gap-2 py-4 tea-text-caption tea-fg-subtle">
        <span class="i-mdi-loading size-4 animate-spin" aria-hidden="true" />
        {{ t('sidebar.loadingMore') }}
      </div>
    </div>
  </aside>
</template>
