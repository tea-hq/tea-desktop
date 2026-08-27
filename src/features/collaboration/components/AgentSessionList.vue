<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaButton } from '@/shared/ui'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
const props = defineProps<{ conversations: ConversationSummary[]; runtimes: RuntimeDescriptor[]; loading?: boolean; hasMore?: boolean }>()
const emit = defineEmits<{ select: [id: string]; loadMore: [] }>()
const { t } = useI18n()
function runtime(id: string): string { return props.runtimes.find(value => value.id === id)?.displayName ?? id }
</script>
<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <TeaButton v-for="conversation in conversations" :key="conversation.conversationId" appearance="ghost" class="session-row flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left" @click="emit('select', conversation.conversationId)">
      <span class="i-mdi-message-processing-outline mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1"><strong class="block truncate tea-text-body">{{ conversation.title || t('sidebar.untitled') }}</strong><span class="mt-0.5 block truncate tea-text-caption">{{ conversation.lastMessagePreview || t('channels.collaboration.noPreview') }}</span></span>
      <span class="max-w-24 truncate tea-text-caption">{{ runtime(conversation.runtimeId) }}</span>
    </TeaButton>
    <TeaButton v-if="hasMore" :loading="loading" appearance="ghost" size="small" @click="emit('loadMore')">{{ t('channels.history.loadMore') }}</TeaButton>
  </div>
</template>
<style scoped>
.session-row { border-bottom: 1px solid var(--p-content-border-color); color: var(--p-text-color); }
.session-row:hover,.session-row:focus-visible { background: var(--p-content-hover-background); outline: none; }
.session-row span { color: var(--p-text-muted-color); }
</style>
