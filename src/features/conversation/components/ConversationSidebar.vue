<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { useI18n } from 'vue-i18n'

import RuntimeIcon from '../../../shared/ui/RuntimeIcon.vue'
import type {
  ConversationScopeFilter,
  ConversationSummary,
  ConversationUiError,
  RuntimeDescriptor,
} from '../contracts'

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
  return props.runtimes.find((runtime) => runtime.id === runtimeId)?.displayName ?? runtimeId
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
  <aside class="hidden h-full w-[320px] flex-col border-r border-line bg-canvas sm:flex">
    <div class="p-3">
      <TeaButton
        class="flex w-full items-center justify-center gap-2 rounded-control bg-fg px-4 py-2.5 text-sm font-medium text-canvas transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        @click="emit('new')"
      >
        <span class="i-mdi-plus size-4" aria-hidden="true" />
        {{ t('sidebar.newConversation') }}
      </TeaButton>
      <div class="mt-2 grid grid-cols-3 gap-1 rounded-control bg-muted p-1">
        <TeaButton
          v-for="kind in ['all', 'local', 'channel'] as const"
          :key="kind"
          class="rounded-structural px-1.5 py-1 text-xs font-medium transition-colors"
          :class="filter.kind === kind ? 'bg-raised text-fg' : 'text-subtle hover:text-fg'"
          @click="emit('filter', { kind })"
        >
          {{ t(`sidebar.filters.${kind}`) }}
        </TeaButton>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-3" @scroll.passive="handleScroll">
      <div
        v-if="loading"
        class="flex items-center justify-center gap-2 px-3 py-8 text-sm text-subtle"
      >
        <span class="i-mdi-loading size-4 animate-spin" aria-hidden="true" />
        {{ t('sidebar.loading') }}
      </div>
      <div v-else-if="error" class="px-3 py-6 text-center">
        <p class="text-sm leading-5 text-danger">{{ errorText(error) }}</p>
        <TeaButton
          class="mt-3 inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="emit('retry')"
        >
          <span class="i-mdi-refresh size-3.5" aria-hidden="true" />
          {{ t('sidebar.retry') }}
        </TeaButton>
      </div>
      <p v-else-if="conversations.length === 0" class="px-3 py-8 text-center text-sm text-subtle">
        {{ t('sidebar.empty') }}
      </p>
      <TeaButton
        v-for="(conv, i) in conversations"
        :key="conv.conversationId"
        class="group mb-1 flex h-11 w-full animate-fade-slide items-center gap-2.5 rounded-control px-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="conv.conversationId === activeId ? 'bg-hover' : 'hover:bg-hover'"
        :style="{ animationDelay: `${i * 30}ms` }"
        :aria-label="conversationTitle(conv)"
        :title="conversationTitle(conv)"
        @click="emit('select', conv.conversationId)"
      >
        <RuntimeIcon
          class="transition-colors duration-150"
          :class="conv.conversationId === activeId ? 'text-fg' : 'text-subtle group-hover:text-dim'"
          :runtime-id="conv.runtimeId"
          :label="runtimeName(conv.runtimeId)"
        />
        <span class="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-fg">
          {{ conversationTitle(conv) }}
        </span>
        <span
          v-if="conv.channelBinding"
          class="i-mdi-pound size-3 shrink-0 text-subtle"
          aria-hidden="true"
        />
      </TeaButton>
      <div
        v-if="loadingMore"
        class="flex items-center justify-center gap-2 py-4 text-sm text-subtle"
      >
        <span class="i-mdi-loading size-4 animate-spin" aria-hidden="true" />
        {{ t('sidebar.loadingMore') }}
      </div>
    </div>
  </aside>
</template>
