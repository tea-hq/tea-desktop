<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskItem, TaskPriority, TaskStatus } from '../contracts'
import { TASK_STATUSES } from '../useTaskDemo'
import TaskCollaboratorSummary from './TaskCollaboratorSummary.vue'
import TaskSourceBadge from './TaskSourceBadge.vue'

const props = defineProps<{ tasks: TaskItem[] }>()
const emit = defineEmits<{ select: [taskId: string] }>()
const { t } = useI18n()
const collapsed = ref<TaskStatus[]>([])

const groups = computed(() =>
  TASK_STATUSES.map((status) => ({
    status,
    tasks: props.tasks.filter((task) => task.status === status),
  })).filter((group) => group.tasks.length > 0),
)

function toggle(status: TaskStatus): void {
  collapsed.value = collapsed.value.includes(status)
    ? collapsed.value.filter((item) => item !== status)
    : [...collapsed.value, status]
}

function statusDotClass(status: TaskStatus): string {
  if (status === 'inProgress') return 'bg-warning'
  if (status === 'approval') return 'bg-danger'
  if (status === 'review') return 'bg-brand-accent'
  if (status === 'done') return 'bg-success'
  return 'bg-subtle'
}

function priorityClass(priority: TaskPriority): string {
  if (priority === 'high') return 'bg-danger-subtle text-danger'
  if (priority === 'medium') return 'bg-warning-subtle text-warning'
  return 'bg-success-subtle text-success'
}
</script>

<template>
  <div class="space-y-5 pb-8" data-testid="task-list-view">
    <section v-for="group in groups" :key="group.status" class="min-w-0 sm:min-w-[700px]">
      <button
        type="button"
        class="flex h-11 w-full items-center gap-2 rounded-control bg-panel px-3 text-left text-sm font-semibold text-fg transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus motion-reduce:transition-none"
        :aria-expanded="!collapsed.includes(group.status)"
        @click="toggle(group.status)"
      >
        <span :class="[statusDotClass(group.status), 'size-2.5 rounded-full']" aria-hidden="true" />
        <span>{{ t(`tasks.status.${group.status}`) }}</span>
        <span
          class="rounded-inline border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-medium text-subtle"
        >
          {{ group.tasks.length }}
        </span>
        <span class="flex-1" />
        <span
          :class="collapsed.includes(group.status) ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'"
          class="size-4 text-subtle"
          aria-hidden="true"
        />
      </button>

      <template v-if="!collapsed.includes(group.status)">
        <div
          class="task-list__grid hidden border-b border-line-soft px-3 py-2 text-[11px] font-semibold uppercase text-subtle sm:grid"
          role="row"
        >
          <span role="columnheader">{{ t('tasks.columns.task') }}</span>
          <span role="columnheader">{{ t('tasks.columns.source') }}</span>
          <span role="columnheader">{{ t('tasks.columns.priority') }}</span>
          <span role="columnheader">{{ t('tasks.columns.progress') }}</span>
          <span role="columnheader">{{ t('tasks.columns.due') }}</span>
          <span role="columnheader" class="text-right">{{ t('tasks.columns.collaborators') }}</span>
        </div>

        <button
          v-for="task in group.tasks"
          :key="task.id"
          type="button"
          class="task-list__grid group block w-full border-b border-line-soft px-3 py-3.5 text-left transition-colors hover:bg-hover focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-focus motion-reduce:transition-none sm:grid"
          data-testid="task-list-row"
          :data-task-id="task.id"
          :data-task-status="task.status"
          @click="emit('select', task.id)"
        >
          <span class="flex min-w-0 items-center gap-3">
            <span class="w-[72px] shrink-0 font-mono text-xs text-subtle">{{ task.id }}</span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-fg">{{ task.title }}</span>
              <span class="mt-0.5 block truncate text-xs text-subtle sm:hidden">
                {{ task.source.name }} · {{ task.dueLabel }}
              </span>
            </span>
          </span>
          <span class="hidden sm:block"><TaskSourceBadge :source="task.source" /></span>
          <span class="hidden sm:block">
            <span
              :class="[
                priorityClass(task.priority),
                'rounded-inline px-2 py-1 text-[11px] font-semibold',
              ]"
            >
              {{ t(`tasks.priority.${task.priority}`) }}
            </span>
          </span>
          <span class="hidden min-w-0 items-center gap-2 sm:flex">
            <span class="h-1.5 min-w-12 flex-1 overflow-hidden rounded-pill bg-muted">
              <span
                class="block h-full rounded-pill bg-fg transition-[width] motion-reduce:transition-none"
                :style="{ width: `${task.progress}%` }"
              />
            </span>
            <span class="w-8 text-right font-mono text-[11px] text-subtle">
              {{ task.progress }}%
            </span>
          </span>
          <span class="hidden truncate text-xs text-dim sm:block">{{ task.dueLabel }}</span>
          <TaskCollaboratorSummary
            class="hidden sm:flex"
            :collaborators="task.collaborators"
            mode="list"
          />
        </button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.task-list__grid {
  grid-template-columns:
    minmax(260px, 2.1fr) minmax(132px, 0.9fr) 88px minmax(120px, 0.9fr)
    96px 104px;
  gap: 16px;
  align-items: center;
}
</style>
