<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaIconButton, TeaInput } from '@/shared/ui'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import AgentRuntimeMenu from '@/features/conversation/components/AgentRuntimeMenu.vue'
import AgentSessionEmptyState from './AgentSessionEmptyState.vue'
import AgentSessionList from './AgentSessionList.vue'
const props = defineProps<{
  conversations: ConversationSummary[]
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId?: string | null
  mode: 'recent' | 'all'
  query: string
  loading?: boolean
  error?: string | null
  hasMore?: boolean
}>()
const emit = defineEmits<{
  select: [id: string]
  create: []
  createWithRuntime: [runtimeId: string]
  viewAll: []
  updateQuery: [value: string]
  loadMore: []
}>()
const { t } = useI18n()
const canCreate = computed(() => props.runtimes.some((runtime) => runtime.status === 'ready'))
const visible = computed(() => {
  const query = props.query.trim().toLocaleLowerCase()
  const values = query
    ? props.conversations.filter((value) =>
        `${value.title ?? ''} ${value.lastMessagePreview ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
      )
    : props.conversations
  return props.mode === 'recent' ? values.slice(0, 8) : values
})
</script>
<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="conversations.length > 0" class="shrink-0 border-b border-line px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="min-w-0 truncate text-sm font-semibold text-fg">
          {{
            mode === 'recent'
              ? t('channels.collaboration.recentSessions')
              : t('channels.collaboration.allSessions')
          }}
        </h3>
        <div class="flex shrink-0 items-center gap-1">
          <TeaIconButton
            v-if="mode === 'recent' && conversations.length > 8"
            size="small"
            :label="t('channels.collaboration.viewAllSessions')"
            icon="i-mdi-view-list-outline"
            @click="emit('viewAll')"
          />
          <TeaIconButton
            size="small"
            :label="t('channels.collaboration.newSession')"
            icon="i-mdi-plus"
            :disabled="!canCreate"
            @click="emit('create')"
          />
          <AgentRuntimeMenu
            v-if="runtimes.length > 1"
            :runtimes="runtimes"
            :default-runtime-id="defaultRuntimeId"
            :label="t('channels.collaboration.chooseOtherAgent')"
            :menu-label="t('channels.collaboration.chooseAgent')"
            @select="emit('createWithRuntime', $event)"
          />
        </div>
      </div>
      <TeaInput
        v-if="mode === 'all'"
        class="mt-3"
        :model-value="query"
        :label="t('channels.collaboration.searchSessions')"
        type="search"
        :placeholder="t('channels.collaboration.searchSessions')"
        @update:model-value="emit('updateQuery', $event)"
      />
    </div>
    <div
      v-if="error"
      class="flex shrink-0 items-start gap-2 px-4 py-2 text-sm leading-5 text-danger"
      role="alert"
    >
      <span class="i-mdi-alert-circle-outline mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>
    <div
      v-if="loading && conversations.length === 0"
      class="space-y-1 px-4 py-3"
      role="status"
      :aria-label="t('channels.collaboration.loadingSessions')"
    >
      <div
        v-for="index in 3"
        :key="index"
        class="flex animate-pulse items-start gap-3 rounded-inline px-3 py-2.5 motion-reduce:animate-none"
      >
        <span class="mt-0.5 size-4 shrink-0 rounded-full bg-surface-strong" />
        <span class="min-w-0 flex-1 space-y-2">
          <span class="block h-3 w-2/5 rounded-inline bg-surface-strong" />
          <span class="block h-2.5 w-4/5 rounded-inline bg-panel" />
        </span>
      </div>
    </div>
    <AgentSessionEmptyState
      v-else-if="conversations.length === 0"
      class="flex-1"
      :runtimes="runtimes"
      :default-runtime-id="defaultRuntimeId"
      @create="emit('create')"
      @create-with-runtime="emit('createWithRuntime', $event)"
    />
    <template v-else>
      <div
        v-if="mode === 'all' && visible.length === 0"
        class="flex flex-1 flex-col items-center justify-center px-8 py-8 text-center text-dim"
        role="status"
      >
        <span class="i-mdi-magnify mb-2 size-6 text-subtle" aria-hidden="true" />
        <p class="text-sm">{{ t('channels.collaboration.noMatchingSessions') }}</p>
      </div>
      <AgentSessionList
        v-else
        :conversations="visible"
        :runtimes="runtimes"
        :loading="loading"
        :has-more="hasMore"
        @select="emit('select', $event)"
        @load-more="emit('loadMore')"
      />
    </template>
  </div>
</template>
