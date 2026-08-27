<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaInput } from '@/shared/ui'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import AgentSessionEmptyState from './AgentSessionEmptyState.vue'
import AgentSessionList from './AgentSessionList.vue'
const props = defineProps<{ conversations: ConversationSummary[]; runtimes: RuntimeDescriptor[]; runtimeId: string | null; mode: 'recent' | 'all'; query: string; loading?: boolean; hasMore?: boolean }>()
const emit = defineEmits<{ select: [id: string]; create: []; selectRuntime: [id: string]; viewAll: []; updateQuery: [value: string]; loadMore: [] }>()
const { t } = useI18n()
const visible = computed(() => { const query = props.query.trim().toLocaleLowerCase(); const values = query ? props.conversations.filter(value => `${value.title ?? ''} ${value.lastMessagePreview ?? ''}`.toLocaleLowerCase().includes(query)) : props.conversations; return props.mode === 'recent' ? values.slice(0, 8) : values })
</script>
<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-2 p-3"><TeaInput v-if="mode === 'all'" :model-value="query" :label="t('channels.collaboration.searchSessions')" type="search" :placeholder="t('channels.collaboration.searchSessions')" @update:model-value="emit('updateQuery', $event)" /><TeaButton appearance="primary" size="small" @click="emit('create')"><span class="i-mdi-plus size-4" />{{ t('channels.collaboration.newSession') }}</TeaButton></div>
    <AgentSessionEmptyState v-if="conversations.length === 0" :runtimes="runtimes" :runtime-id="runtimeId" @create="emit('create')" @select-runtime="emit('selectRuntime', $event)" />
    <template v-else><AgentSessionList :conversations="visible" :runtimes="runtimes" :loading="loading" :has-more="hasMore" @select="emit('select', $event)" @load-more="emit('loadMore')" /><TeaButton v-if="mode === 'recent' && conversations.length > 8" appearance="ghost" @click="emit('viewAll')">{{ t('channels.collaboration.viewAllSessions') }}</TeaButton></template>
  </div>
</template>
