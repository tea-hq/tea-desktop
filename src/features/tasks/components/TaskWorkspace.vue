<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaSelect } from '@/shared/ui'
import type { TeaSelectOption } from '@/shared/ui'
import type { TaskStatus } from '../contracts'
import { useTaskDemo, type TaskSourceFilter } from '../useTaskDemo'
import TaskBoardView from './TaskBoardView.vue'
import TaskCreateDialog from './TaskCreateDialog.vue'
import TaskDetailDrawer from './TaskDetailDrawer.vue'
import TaskListView from './TaskListView.vue'

const props = defineProps<{ searchQuery: string }>()
const { t } = useI18n()
const taskDemo = useTaskDemo(toRef(props, 'searchQuery'), t)

const sourceOptions = computed<TeaSelectOption<TaskSourceFilter>[]>(() => [
  { value: 'all', label: t('tasks.filters.allSources') },
  { value: 'plugin', label: t('tasks.sources.plugin') },
  { value: 'message', label: t('tasks.sources.message') },
  { value: 'local', label: t('tasks.sources.local') },
])
const activeCount = computed(
  () => taskDemo.tasks.value.filter((task) => task.status !== 'done').length,
)
const agentRoleCount = computed(
  () =>
    new Set(
      taskDemo.tasks.value.flatMap((task) =>
        task.collaborators
          .filter((collaborator) => collaborator.kind === 'agent')
          .map((collaborator) => collaborator.role),
      ),
    ).size,
)
const groupedCounts = computed<Record<TaskStatus, number>>(() => ({
  inbox: taskDemo.visibleTasks.value.filter((task) => task.status === 'inbox').length,
  inProgress: taskDemo.visibleTasks.value.filter((task) => task.status === 'inProgress').length,
  approval: taskDemo.visibleTasks.value.filter((task) => task.status === 'approval').length,
  review: taskDemo.visibleTasks.value.filter((task) => task.status === 'review').length,
  done: taskDemo.visibleTasks.value.filter((task) => task.status === 'done').length,
}))
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas" data-testid="task-workspace">
    <header class="shrink-0 border-b border-line px-4 pb-4 pt-5 sm:px-6 lg:px-8">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2.5">
            <h1 class="text-2xl font-semibold leading-8 tracking-normal text-fg">
              {{ t('tasks.title') }}
            </h1>
            <span class="rounded-pill bg-muted px-2.5 py-1 font-mono text-xs text-subtle">
              {{ taskDemo.tasks.value.length }}
            </span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
            <span>{{ t('tasks.summary.active', { count: activeCount }) }}</span>
            <span>{{ t('tasks.summary.sources', { count: 3 }) }}</span>
            <span>{{ t('tasks.summary.agentRoles', { count: agentRoleCount }) }}</span>
            <span>{{ t('tasks.summary.approval', { count: groupedCounts.approval }) }}</span>
          </div>
        </div>
        <TeaButton appearance="primary" @click="taskDemo.createDialogOpen.value = true">
          <span class="i-mdi-plus size-4" aria-hidden="true" />
          {{ t('tasks.createTask') }}
        </TeaButton>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div
          class="inline-flex rounded-pill bg-panel p-1"
          role="radiogroup"
          :aria-label="t('tasks.view.label')"
        >
          <button
            v-for="option in [
              { value: 'list', icon: 'i-mdi-view-list-outline', label: t('tasks.view.list') },
              { value: 'board', icon: 'i-mdi-view-column-outline', label: t('tasks.view.board') },
            ]"
            :key="option.value"
            type="button"
            role="radio"
            :aria-label="option.label"
            :aria-checked="taskDemo.viewMode.value === option.value"
            :class="[
              'inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus motion-reduce:transition-none',
              taskDemo.viewMode.value === option.value
                ? 'border-line-soft bg-canvas text-fg'
                : 'border-transparent text-dim hover:text-fg',
            ]"
            @click="taskDemo.viewMode.value = option.value as 'list' | 'board'"
          >
            <span :class="[option.icon, 'size-4']" aria-hidden="true" />
            <span>{{ option.label }}</span>
          </button>
        </div>

        <div class="flex min-w-0 items-center gap-2">
          <span v-if="searchQuery" class="hidden text-xs text-subtle sm:inline">
            {{ t('tasks.summary.results', { count: taskDemo.visibleTasks.value.length }) }}
          </span>
          <TeaSelect
            v-model="taskDemo.sourceFilter.value"
            :options="sourceOptions"
            :label="t('tasks.filters.source')"
            size="small"
          />
        </div>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-4 pt-5 sm:px-6 lg:px-8">
      <TaskListView
        v-if="taskDemo.visibleTasks.value.length > 0 && taskDemo.viewMode.value === 'list'"
        :tasks="taskDemo.visibleTasks.value"
        @select="taskDemo.selectTask"
      />
      <TaskBoardView
        v-else-if="taskDemo.visibleTasks.value.length > 0"
        :tasks="taskDemo.visibleTasks.value"
        @select="taskDemo.selectTask"
      />
      <div
        v-else
        class="flex min-h-72 flex-col items-center justify-center text-center"
        data-testid="task-empty"
      >
        <span
          class="i-mdi-checkbox-marked-circle-auto-outline size-8 text-subtle"
          aria-hidden="true"
        />
        <h2 class="mt-3 text-base font-semibold tracking-normal text-fg">
          {{ t('tasks.empty.title') }}
        </h2>
        <p class="mt-1 text-sm text-subtle">{{ t('tasks.empty.description') }}</p>
      </div>
    </div>

    <TaskDetailDrawer
      :task="taskDemo.selectedTask.value"
      @close="taskDemo.closeTask"
      @update-status="taskDemo.updateStatus"
      @add-tag="taskDemo.addTag"
      @remove-tag="taskDemo.removeTag"
      @add-comment="taskDemo.addComment"
      @submit-approval="taskDemo.submitApproval"
    />
    <TaskCreateDialog
      :open="taskDemo.createDialogOpen.value"
      @close="taskDemo.createDialogOpen.value = false"
      @create="taskDemo.createLocalTask"
    />
  </main>
</template>
