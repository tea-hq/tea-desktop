<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaButton } from '@/shared/ui'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'

const props = defineProps<{
  conversations: ConversationSummary[]
  runtimes: RuntimeDescriptor[]
  loading?: boolean
  hasMore?: boolean
}>()
const emit = defineEmits<{ select: [id: string]; loadMore: [] }>()
const { t } = useI18n()
function runtime(id: string): string {
  return props.runtimes.find((value) => value.id === id)?.displayName ?? id
}
</script>
<template>
  <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
    <TeaButton
      v-for="conversation in conversations"
      :key="conversation.conversationId"
      appearance="ghost"
      :disabled="loading"
      class="session-row flex w-full min-w-0 items-start justify-start gap-3 px-3 py-2.5 text-left"
      @click="emit('select', conversation.conversationId)"
    >
      <span
        class="i-mdi-message-text-outline mt-0.5 size-4 shrink-0 text-subtle"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1">
        <strong class="block truncate text-sm font-semibold leading-5 text-fg">{{
          conversation.title || t('sidebar.untitled')
        }}</strong>
        <span class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-4">
          <span class="min-w-0 flex-1 truncate text-dim">{{
            conversation.lastMessagePreview || t('channels.collaboration.noPreview')
          }}</span>
          <span class="text-subtle" aria-hidden="true">&#183;</span>
          <span class="max-w-28 shrink-0 truncate text-subtle">{{
            runtime(conversation.runtimeId)
          }}</span>
        </span>
      </span>
    </TeaButton>
    <TeaButton
      v-if="hasMore"
      :loading="loading"
      appearance="ghost"
      size="small"
      @click="emit('loadMore')"
      >{{ t('channels.history.loadMore') }}</TeaButton
    >
  </div>
</template>
<style scoped>
.session-row {
  color: var(--tea-fg);
  border-radius: var(--tea-radius-inline);
}
</style>
