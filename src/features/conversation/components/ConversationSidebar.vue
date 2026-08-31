<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { TeaButton, TeaIconButton } from '@/shared/ui'

import RuntimeIcon from '../../../shared/ui/RuntimeIcon.vue'
import type {
  ConversationScopeFilter,
  ConversationSummary,
  ConversationUiError,
  RuntimeDescriptor,
} from '../contracts'
import AgentRuntimeMenu from './AgentRuntimeMenu.vue'

const props = defineProps<{
  conversations: ConversationSummary[]
  activeId: string | null
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId?: string | null
  loading: boolean
  loadingMore: boolean
  error: ConversationUiError | null
  hasMore: boolean
  filter: ConversationScopeFilter
}>()

const emit = defineEmits<{
  new: []
  newWithRuntime: [runtimeId: string]
  select: [id: string]
  loadMore: []
  retry: []
  filter: [filter: ConversationScopeFilter]
}>()
const { t } = useI18n()

const conversationGroups = computed(() => {
  const groups = new Map<string, ConversationSummary[]>()
  for (const conversation of props.conversations) {
    const group = groups.get(conversation.workspaceId)
    if (group) group.push(conversation)
    else groups.set(conversation.workspaceId, [conversation])
  }
  return Array.from(groups, ([workspaceId, conversations]) => ({ workspaceId, conversations }))
})

function runtimeName(runtimeId: string): string {
  return props.runtimes.find((runtime) => runtime.id === runtimeId)?.displayName ?? runtimeId
}

function conversationTitle(conversation: ConversationSummary): string {
  return conversation.title || t('sidebar.untitled')
}

function workspaceTitle(workspaceId: string): string {
  if (!workspaceId || workspaceId === 'desktop-workspace' || workspaceId === 'e2e') {
    return t('sidebar.workspace')
  }
  return workspaceId
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
  <aside class="hidden h-full w-[288px] flex-col border-r border-line-soft bg-panel sm:flex">
    <header class="conversation-sidebar__header">
      <h2 class="conversation-sidebar__title">{{ t('sidebar.title') }}</h2>
      <div class="conversation-sidebar__actions">
        <TeaIconButton
          size="small"
          :label="t('sidebar.newConversation')"
          icon="i-mdi-plus"
          @click="emit('new')"
        />
        <AgentRuntimeMenu
          v-if="runtimes.length > 1"
          :runtimes="runtimes"
          :default-runtime-id="defaultRuntimeId"
          :label="t('channels.collaboration.chooseOtherAgent')"
          :menu-label="t('channels.collaboration.chooseAgent')"
          @select="emit('newWithRuntime', $event)"
        />
      </div>
    </header>
    <nav class="conversation-filters" :aria-label="t('sidebar.filterLabel')">
      <div class="conversation-filters__list" role="tablist">
        <TeaButton
          v-for="kind in ['all', 'local', 'channel'] as const"
          :key="kind"
          appearance="ghost"
          size="small"
          role="tab"
          :aria-selected="filter.kind === kind"
          class="conversation-filter"
          :class="filter.kind === kind ? 'conversation-filter--active text-fg' : 'text-subtle'"
          @click="emit('filter', { kind })"
        >
          {{ t(`sidebar.filters.${kind}`) }}
        </TeaButton>
      </div>
    </nav>

    <div class="flex-1 overflow-y-auto bg-canvas px-3 pb-3 pt-2" @scroll.passive="handleScroll">
      <div
        v-if="loading"
        class="flex items-center justify-center gap-2 px-3 py-6 text-sm text-subtle"
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
      <p v-else-if="conversations.length === 0" class="px-3 py-6 text-center text-sm text-subtle">
        {{ t('sidebar.empty') }}
      </p>
      <section
        v-for="(group, groupIndex) in conversationGroups"
        :key="group.workspaceId"
        class="workspace-group"
        :aria-labelledby="`conversation-workspace-${groupIndex}`"
      >
        <div class="workspace-group__header">
          <span class="i-mdi-folder-outline size-3.5" aria-hidden="true" />
          <span :id="`conversation-workspace-${groupIndex}`" class="truncate">
            {{ workspaceTitle(group.workspaceId) }}
          </span>
          <span class="workspace-group__count">{{ group.conversations.length }}</span>
        </div>
        <div class="workspace-group__items">
          <TeaButton
            v-for="(conv, conversationIndex) in group.conversations"
            :key="conv.conversationId"
            appearance="ghost"
            class="conversation-row group flex min-h-9 w-full animate-fade-slide items-center justify-start gap-2 px-2 text-left"
            :class="conv.conversationId === activeId ? 'bg-panel' : 'hover:bg-hover'"
            :style="{ animationDelay: `${(groupIndex * 4 + conversationIndex) * 30}ms` }"
            :aria-label="conversationTitle(conv)"
            :title="conversationTitle(conv)"
            @click="emit('select', conv.conversationId)"
          >
            <RuntimeIcon
              size="small"
              class="conversation-row__runtime transition-colors duration-150"
              :class="
                conv.conversationId === activeId ? 'text-fg' : 'text-subtle group-hover:text-dim'
              "
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
        </div>
      </section>
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

<style scoped>
.conversation-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem 0.5rem;
}

.conversation-sidebar__actions {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.25rem;
}

.conversation-sidebar__title {
  min-width: 0;
  color: var(--tea-fg);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25;
}

.conversation-filters {
  padding-inline: 0.75rem;
}

.conversation-filters__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--tea-line-soft);
}

.conversation-filter {
  position: relative;
  min-width: 0;
  min-height: 2.25rem;
  border-radius: 0;
  padding-inline: 0.5rem;
  font-size: 0.75rem;
}

.conversation-filter--active::after {
  position: absolute;
  right: 0.75rem;
  bottom: -1px;
  left: 0.75rem;
  height: 1px;
  background: var(--tea-fg);
  content: '';
}

.workspace-group {
  margin-top: 0.625rem;
}

.workspace-group:first-child {
  margin-top: 0.25rem;
}

.workspace-group__header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.75rem;
  padding-inline: 0.5rem;
  color: var(--tea-subtle);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-transform: uppercase;
}

.workspace-group__count {
  margin-left: auto;
  color: var(--tea-disabled);
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.workspace-group__items {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-left: 0.375rem;
}

.conversation-row {
  border-radius: var(--tea-radius-inline);
}
</style>
