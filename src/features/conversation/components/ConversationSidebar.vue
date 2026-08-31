<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { TeaButton, TeaDialog, TeaIconButton } from '@/shared/ui'

import ConversationSidebarItem from './ConversationSidebarItem.vue'
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
  runningConversationIds?: ReadonlySet<string>
  completedConversationIds?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  new: []
  newWithRuntime: [runtimeId: string]
  select: [id: string]
  loadMore: []
  retry: []
  filter: [filter: ConversationScopeFilter]
  archive: [id: string]
  delete: [id: string]
}>()
const { t } = useI18n()
const recentExpanded = ref(true)
const projectsExpanded = ref(true)
const collapsedProjects = ref(new Set<string>())
const pendingAction = ref<{ type: 'archive' | 'delete'; id: string; title: string } | null>(null)

const groupedConversations = computed(() => {
  const projects = new Map<string, ConversationSummary[]>()
  const recent: ConversationSummary[] = []
  for (const conversation of props.conversations) {
    if (!conversation.workingDirectory) {
      recent.push(conversation)
      continue
    }
    const group = projects.get(conversation.workingDirectory)
    if (group) group.push(conversation)
    else projects.set(conversation.workingDirectory, [conversation])
  }
  return {
    recent,
    projects: Array.from(projects, ([workingDirectory, conversations]) => ({
      workingDirectory,
      conversations,
    })),
  }
})

function runtimeName(runtimeId: string): string {
  return props.runtimes.find((runtime) => runtime.id === runtimeId)?.displayName ?? runtimeId
}

function conversationTitle(conversation: ConversationSummary): string {
  return conversation.title || conversation.lastMessagePreview || t('sidebar.untitled')
}

function projectName(workingDirectory: string): string {
  const normalized = workingDirectory.replace(/[\\/]+$/u, '')
  return normalized ? normalized.split(/[\\/]/u).at(-1) || normalized : workingDirectory
}

function isProjectExpanded(workingDirectory: string): boolean {
  return !collapsedProjects.value.has(workingDirectory)
}

function toggleProject(workingDirectory: string): void {
  const next = new Set(collapsedProjects.value)
  if (next.has(workingDirectory)) next.delete(workingDirectory)
  else next.add(workingDirectory)
  collapsedProjects.value = next
}

function errorText(error: ConversationUiError): string {
  return error.kind === 'localized' ? t(error.key, error.params ?? {}) : error.message
}

function isRunning(id: string): boolean {
  return props.runningConversationIds?.has(id) ?? false
}

function isCompleted(id: string): boolean {
  return id !== props.activeId && (props.completedConversationIds?.has(id) ?? false)
}

function handleScroll(event: Event): void {
  const target = event.currentTarget as HTMLElement
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 80 && props.hasMore) {
    emit('loadMore')
  }
}

function requestAction(type: 'archive' | 'delete', conversation: ConversationSummary): void {
  pendingAction.value = {
    type,
    id: conversation.conversationId,
    title: conversationTitle(conversation),
  }
}

function confirmAction(): void {
  const action = pendingAction.value
  if (!action) return
  pendingAction.value = null
  if (action.type === 'archive') emit('archive', action.id)
  else emit('delete', action.id)
}
</script>

<template>
  <aside
    class="conversation-sidebar hidden h-full w-[288px] flex-col border-r border-line bg-panel sm:flex"
  >
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

    <div
      class="conversation-sidebar__scroll flex-1 overflow-y-auto bg-panel pb-3 pt-2"
      @scroll.passive="handleScroll"
    >
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
      <section v-if="groupedConversations.recent.length" class="workspace-group">
        <button
          type="button"
          class="workspace-group__header w-full cursor-pointer text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-focus"
          :aria-expanded="recentExpanded"
          @click="recentExpanded = !recentExpanded"
        >
          <span class="i-mdi-clock-outline size-3.5" aria-hidden="true" />
          <span class="truncate">{{ t('sidebar.recentConversations') }}</span>
          <span
            class="workspace-group__chevron i-mdi-chevron-down size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
            :class="{ '-rotate-90': !recentExpanded }"
            aria-hidden="true"
          />
        </button>
        <div v-if="recentExpanded" class="workspace-group__items">
          <ConversationSidebarItem
            v-for="(conv, conversationIndex) in groupedConversations.recent"
            :key="conv.conversationId"
            :conversation="conv"
            :runtime-label="runtimeName(conv.runtimeId)"
            :active="conv.conversationId === activeId"
            :running="isRunning(conv.conversationId)"
            :completed="isCompleted(conv.conversationId)"
            :animation-delay="`${conversationIndex * 30}ms`"
            :disabled="loading"
            @select="emit('select', $event)"
            @archive="requestAction('archive', conv)"
            @delete="requestAction('delete', conv)"
          />
        </div>
      </section>
      <section
        v-if="groupedConversations.projects.length"
        class="workspace-group workspace-group--projects"
      >
        <button
          type="button"
          class="workspace-group__header w-full cursor-pointer text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-focus"
          :aria-expanded="projectsExpanded"
          @click="projectsExpanded = !projectsExpanded"
        >
          <span class="i-mdi-folder-multiple-outline size-3.5" aria-hidden="true" />
          <span class="truncate">{{ t('sidebar.projects') }}</span>
          <span
            class="workspace-group__chevron i-mdi-chevron-down size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
            :class="{ '-rotate-90': !projectsExpanded }"
            aria-hidden="true"
          />
        </button>
        <div v-if="projectsExpanded" class="workspace-projects">
          <section
            v-for="(project, projectIndex) in groupedConversations.projects"
            :key="project.workingDirectory"
            class="workspace-project"
            :aria-labelledby="`conversation-project-${projectIndex}`"
          >
            <button
              type="button"
              class="workspace-project__header w-full cursor-pointer text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-focus"
              :title="project.workingDirectory"
              :aria-expanded="isProjectExpanded(project.workingDirectory)"
              :aria-controls="`conversation-project-items-${projectIndex}`"
              @click="toggleProject(project.workingDirectory)"
            >
              <span class="i-mdi-folder-outline size-3.5" aria-hidden="true" />
              <span :id="`conversation-project-${projectIndex}`" class="truncate">
                {{ projectName(project.workingDirectory) }}
              </span>
            </button>
            <div
              v-if="isProjectExpanded(project.workingDirectory)"
              :id="`conversation-project-items-${projectIndex}`"
              class="workspace-group__items"
            >
              <ConversationSidebarItem
                v-for="(conv, conversationIndex) in project.conversations"
                :key="conv.conversationId"
                :conversation="conv"
                :runtime-label="runtimeName(conv.runtimeId)"
                :active="conv.conversationId === activeId"
                :running="isRunning(conv.conversationId)"
                :completed="isCompleted(conv.conversationId)"
                project
                :animation-delay="`${(projectIndex * 4 + conversationIndex) * 30}ms`"
                :disabled="loading"
                @select="emit('select', $event)"
                @archive="requestAction('archive', conv)"
                @delete="requestAction('delete', conv)"
              />
            </div>
          </section>
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
  <TeaDialog
    :open="pendingAction !== null"
    :title="
      pendingAction?.type === 'delete'
        ? t('sidebar.deleteConversation')
        : t('sidebar.archiveConversation')
    "
    :dismissable="true"
    :close-label="t('common.close')"
    width="small"
    @close="pendingAction = null"
  >
    <p class="text-sm leading-6 text-dim">
      {{
        pendingAction?.type === 'delete'
          ? t('sidebar.deleteConfirm', { title: pendingAction.title })
          : t('sidebar.archiveConfirm', { title: pendingAction?.title ?? '' })
      }}
    </p>
    <template #footer>
      <TeaButton appearance="ghost" size="small" @click="pendingAction = null">
        {{ t('sidebar.cancelAction') }}
      </TeaButton>
      <TeaButton
        :appearance="pendingAction?.type === 'delete' ? 'danger' : 'primary'"
        size="small"
        @click="confirmAction"
      >
        {{
          pendingAction?.type === 'delete'
            ? t('sidebar.confirmDelete')
            : t('sidebar.confirmArchive')
        }}
      </TeaButton>
    </template>
  </TeaDialog>
</template>

<style scoped>
.conversation-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem 0.5rem;
}

.conversation-sidebar__scroll {
  background: var(--tea-panel);
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
  min-height: 2.25rem;
  padding-inline: 1rem;
  color: var(--tea-dim);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-transform: uppercase;
}

.workspace-group__chevron {
  margin-left: auto;
  color: var(--tea-subtle);
  opacity: 0.65;
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.workspace-group__header:hover .workspace-group__chevron,
.workspace-group__header:focus-visible .workspace-group__chevron {
  opacity: 1;
}

.workspace-group__items {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.workspace-group--projects {
  margin-top: 1rem;
}

.workspace-projects {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.workspace-project__header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.25rem;
  padding-inline: 1rem;
  color: var(--tea-fg);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25;
}
</style>
