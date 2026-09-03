<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskItem, TaskPriority, TaskStatus } from '../contracts'
import { taskTagClass } from '../taskTagPresentation'
import { TASK_STATUSES } from '../useTaskDemo'
import TaskCollaboratorSummary from './TaskCollaboratorSummary.vue'
import TaskSourceBadge from './TaskSourceBadge.vue'

const props = defineProps<{ tasks: TaskItem[] }>()
const emit = defineEmits<{ select: [taskId: string] }>()
const { t } = useI18n()

const columns = computed(() =>
  TASK_STATUSES.map((status) => ({
    status,
    tasks: props.tasks.filter((task) => task.status === status),
  })),
)

function statusDotClass(status: TaskStatus): string {
  if (status === 'inProgress') return 'bg-warning'
  if (status === 'approval') return 'bg-danger'
  if (status === 'review') return 'bg-brand-accent'
  if (status === 'done') return 'bg-success'
  return 'bg-subtle'
}

function statusBadgeClass(status: TaskStatus): string {
  if (status === 'inProgress') return 'bg-warning-subtle text-warning'
  if (status === 'approval') return 'bg-danger-subtle text-danger'
  if (status === 'review') return 'bg-muted text-brand-accent'
  if (status === 'done') return 'bg-success-subtle text-success'
  return 'bg-muted text-subtle'
}

function priorityClass(priority: TaskPriority): string {
  if (priority === 'high') return 'text-danger'
  if (priority === 'medium') return 'text-warning'
  return 'text-success'
}
</script>

<template>
  <div class="grid min-w-[1400px] grid-cols-5 gap-3 pb-8" data-testid="task-board-view">
    <section
      v-for="column in columns"
      :key="column.status"
      class="min-h-[420px] rounded-card bg-panel p-2.5"
    >
      <header class="flex h-9 items-center gap-2 px-1.5">
        <span :class="[statusDotClass(column.status), 'size-2 rounded-full']" aria-hidden="true" />
        <h2 class="text-sm font-semibold tracking-normal text-fg">
          {{ t(`tasks.status.${column.status}`) }}
        </h2>
        <span class="font-mono text-xs text-subtle">{{ column.tasks.length }}</span>
      </header>

      <div class="space-y-2 pt-1">
        <button
          v-for="task in column.tasks"
          :key="task.id"
          type="button"
          class="w-full rounded-control border border-line bg-canvas p-3.5 text-left transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus motion-reduce:transition-none"
          data-testid="task-board-card"
          :data-task-id="task.id"
          :data-task-status="task.status"
          @click="emit('select', task.id)"
        >
          <span class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-2">
              <TaskSourceBadge :source="task.source" compact />
              <span class="font-mono text-[11px] text-subtle">{{ task.id }}</span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <span
                :class="[
                  statusBadgeClass(task.status),
                  'inline-flex h-6 items-center rounded-pill px-2 text-[10px] font-semibold',
                ]"
              >
                {{ t(`tasks.status.${task.status}`) }}
              </span>
              <span :class="[priorityClass(task.priority), 'text-[11px] font-semibold']">
                {{ t(`tasks.priority.${task.priority}`) }}
              </span>
            </span>
          </span>
          <span class="mt-2 block text-sm font-semibold leading-5 text-fg">{{ task.title }}</span>
          <span class="mt-3 block">
            <TaskCollaboratorSummary :collaborators="task.collaborators" mode="board" />
          </span>
          <span class="mt-3 flex items-center gap-2">
            <span class="h-1.5 flex-1 overflow-hidden rounded-pill bg-muted">
              <span
                class="block h-full rounded-pill bg-fg"
                :style="{ width: `${task.progress}%` }"
              />
            </span>
            <span class="font-mono text-[11px] text-subtle">{{ task.progress }}%</span>
          </span>
          <span
            class="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-line-soft pt-3"
          >
            <span class="flex min-w-0 gap-1 overflow-hidden">
              <span
                v-for="(tag, index) in task.tags.slice(0, 2)"
                :key="tag"
                :class="taskTagClass(index)"
                class="truncate rounded-pill px-2 py-0.5 text-[10px] font-medium"
                data-testid="task-tag"
              >
                {{ tag }}
              </span>
            </span>
            <span
              class="inline-flex h-6 shrink-0 items-center gap-1 rounded-inline border border-line bg-canvas px-1.5 text-[10px] text-subtle"
            >
              <span class="i-mdi-calendar-blank-outline size-3.5" aria-hidden="true" />
              {{ task.dueLabel }}
            </span>
          </span>
        </button>
        <p v-if="column.tasks.length === 0" class="px-2 py-8 text-center text-xs text-subtle">
          {{ t('tasks.emptyColumn') }}
        </p>
      </div>
    </section>
  </div>
</template>
