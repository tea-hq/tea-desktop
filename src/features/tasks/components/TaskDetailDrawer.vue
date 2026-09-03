<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaDrawer, TeaIconButton, TeaInput, TeaSelect, TeaTextarea } from '@/shared/ui'
import type { TeaSelectOption } from '@/shared/ui'
import type { TaskApprovalSubmission, TaskItem, TaskPriority, TaskStatus } from '../contracts'
import { taskTagClass } from '../taskTagPresentation'
import TaskApprovalPanel from './TaskApprovalPanel.vue'
import TaskActorAvatar from './TaskActorAvatar.vue'
import TaskCollaboratorSummary from './TaskCollaboratorSummary.vue'
import TaskSourceBadge from './TaskSourceBadge.vue'

const props = defineProps<{ task: TaskItem | null }>()
const emit = defineEmits<{
  close: []
  'update-status': [taskId: string, status: TaskStatus]
  'add-tag': [taskId: string, tag: string]
  'remove-tag': [taskId: string, tag: string]
  'add-comment': [taskId: string, body: string]
  'submit-approval': [taskId: string, submission: TaskApprovalSubmission]
}>()
const { t } = useI18n()
const tagDraft = ref('')
const commentDraft = ref('')

const statusOptions = computed<TeaSelectOption<TaskStatus>[]>(() => [
  { value: 'inbox', label: t('tasks.status.inbox') },
  { value: 'inProgress', label: t('tasks.status.inProgress') },
  { value: 'approval', label: t('tasks.status.approval') },
  { value: 'review', label: t('tasks.status.review') },
  { value: 'done', label: t('tasks.status.done') },
])

watch(
  () => props.task?.id,
  () => {
    tagDraft.value = ''
    commentDraft.value = ''
  },
)

function priorityClass(priority: TaskPriority): string {
  if (priority === 'high') return 'text-danger'
  if (priority === 'medium') return 'text-warning'
  return 'text-success'
}

function updateStatus(status: TaskStatus | null): void {
  if (props.task && status) emit('update-status', props.task.id, status)
}

function addTag(): void {
  if (!props.task || !tagDraft.value.trim()) return
  emit('add-tag', props.task.id, tagDraft.value)
  tagDraft.value = ''
}

function addComment(): void {
  if (!props.task || !commentDraft.value.trim()) return
  emit('add-comment', props.task.id, commentDraft.value)
  commentDraft.value = ''
}

function submitApproval(submission: TaskApprovalSubmission): void {
  if (props.task) emit('submit-approval', props.task.id, submission)
}
</script>

<template>
  <TeaDrawer
    :open="Boolean(task)"
    :title="task?.title ?? t('tasks.detail.title')"
    :close-label="t('tasks.detail.close')"
    width="wide"
    resizable
    :default-width="640"
    :min-width="360"
    :max-width="780"
    :resize-label="t('tasks.detail.resize')"
    :show-header="false"
    @close="emit('close')"
  >
    <div
      v-if="task"
      class="flex min-h-full flex-col bg-canvas"
      data-testid="task-detail"
      :data-task-status="task.status"
    >
      <header class="shrink-0 border-b border-line px-5 pb-4 pt-4 sm:px-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <TaskSourceBadge :source="task.source" compact />
              <span class="font-mono text-xs text-subtle">{{ task.id }}</span>
            </div>
            <h2 class="mt-2.5 text-xl font-semibold leading-7 tracking-normal text-fg">
              {{ task.title }}
            </h2>
            <p class="mt-1.5 max-w-2xl text-sm leading-5 text-dim">{{ task.description }}</p>
          </div>
          <TeaIconButton
            icon="i-mdi-close"
            size="small"
            :label="t('tasks.detail.close')"
            @click="emit('close')"
          />
        </div>
      </header>

      <section
        class="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 border-b border-line-soft px-5 py-2 sm:grid-cols-[minmax(112px,1fr)_auto_auto_minmax(128px,1fr)] sm:gap-x-5 sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-1.5" :title="t('tasks.columns.status')">
          <span class="i-mdi-circle-slice-4 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
          <TeaSelect
            class="min-w-0 flex-1"
            :model-value="task.status"
            :options="statusOptions"
            :label="t('tasks.detail.changeStatus')"
            size="small"
            @update:model-value="updateStatus"
          />
        </div>

        <div
          class="flex min-w-0 items-center gap-1.5"
          role="group"
          :aria-label="t('tasks.columns.priority')"
          :title="t('tasks.columns.priority')"
        >
          <span class="i-mdi-flag-outline size-3.5 shrink-0 text-subtle" aria-hidden="true" />
          <span :class="priorityClass(task.priority)" class="truncate text-xs font-semibold">
            {{ t(`tasks.priority.${task.priority}`) }}
          </span>
        </div>

        <div
          class="flex min-w-0 items-center gap-1.5"
          role="group"
          :aria-label="t('tasks.columns.due')"
          :title="t('tasks.columns.due')"
        >
          <span
            class="i-mdi-calendar-blank-outline size-3.5 shrink-0 text-subtle"
            aria-hidden="true"
          />
          <span class="truncate text-xs text-dim">{{ task.dueLabel }}</span>
        </div>

        <div
          class="col-span-3 flex min-w-0 items-center gap-2 sm:col-span-1"
          :title="t('tasks.columns.progress')"
        >
          <span class="i-mdi-progress-check size-3.5 shrink-0 text-subtle" aria-hidden="true" />
          <span
            class="block h-1.5 min-w-16 flex-1 overflow-hidden rounded-pill bg-muted"
            role="progressbar"
            :aria-label="t('tasks.columns.progress')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="task.progress"
          >
            <span
              class="block h-full rounded-pill bg-fg transition-[width] motion-reduce:transition-none"
              :style="{ width: `${task.progress}%` }"
            />
          </span>
          <span class="w-8 shrink-0 text-right font-mono text-[11px] text-subtle">
            {{ task.progress }}%
          </span>
        </div>
      </section>

      <TaskApprovalPanel
        v-if="task.approval && (task.status === 'approval' || task.approval.status === 'submitted')"
        :request="task.approval"
        @submit="submitApproval"
      />

      <section
        class="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 py-2 sm:px-6"
      >
        <h3 class="flex min-w-0 items-center gap-2 text-xs font-medium text-subtle">
          <span class="i-mdi-account-multiple-outline size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ t('tasks.collaboration.title') }}</span>
        </h3>
        <TaskCollaboratorSummary :collaborators="task.collaborators" />
      </section>

      <section class="shrink-0 border-b border-line-soft px-5 py-4 sm:px-6">
        <div class="flex min-w-0 items-start gap-3">
          <TaskSourceBadge :source="task.source" compact />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="truncate text-xs font-semibold text-fg">{{ task.source.name }}</h3>
              <span class="text-[11px] text-subtle">{{ t('tasks.detail.source') }}</span>
            </div>
            <p class="mt-0.5 truncate text-xs text-subtle">{{ task.source.context }}</p>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            v-for="(tag, index) in task.tags"
            :key="tag"
            type="button"
            :class="taskTagClass(index)"
            class="inline-flex min-h-7 items-center gap-1 rounded-pill px-2.5 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-focus motion-reduce:transition-none"
            data-testid="task-tag"
            :aria-label="t('tasks.detail.removeTag', { tag })"
            :title="t('tasks.detail.removeTag', { tag })"
            @click="emit('remove-tag', task.id, tag)"
          >
            <span>{{ tag }}</span>
            <span class="i-mdi-close size-3.5" aria-hidden="true" />
          </button>
          <span v-if="task.tags.length === 0" class="text-xs text-subtle">
            {{ t('tasks.detail.noTags') }}
          </span>
          <div class="flex min-w-40 flex-1 items-center gap-1.5 sm:max-w-56">
            <TeaInput
              v-model="tagDraft"
              :label="t('tasks.detail.tagLabel')"
              :placeholder="t('tasks.detail.tagPlaceholder')"
              size="small"
              @keydown.enter.prevent="addTag"
            />
            <TeaIconButton
              icon="i-mdi-plus"
              appearance="secondary"
              size="small"
              :label="t('tasks.detail.addTag')"
              :disabled="!tagDraft.trim()"
              @click="addTag"
            />
          </div>
        </div>
      </section>

      <section class="min-h-0 flex-1 px-5 pb-5 pt-4 sm:px-6">
        <div class="flex items-center justify-between gap-4">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-fg">
            <span class="i-mdi-comment-text-outline size-4 text-subtle" aria-hidden="true" />
            {{ t('tasks.detail.activity') }}
            <span class="font-mono text-[11px] font-normal text-subtle">
              {{ task.comments.length }}
            </span>
          </h3>
          <span class="text-[11px] text-subtle">
            {{ t('tasks.detail.updated', { time: task.updatedAtLabel }) }}
          </span>
        </div>

        <div class="mt-2 divide-y divide-line-soft">
          <article
            v-for="comment in task.comments"
            :key="comment.id"
            class="flex items-start gap-3 py-3"
            data-testid="task-comment"
          >
            <TaskActorAvatar :actor="comment.author" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span class="text-xs font-semibold text-fg">{{ comment.author.name }}</span>
                <span class="text-[11px] text-subtle">{{ comment.createdAtLabel }}</span>
              </div>
              <p class="mt-1 text-sm leading-5 text-dim">{{ comment.body }}</p>
            </div>
          </article>
          <div
            v-if="task.comments.length === 0"
            class="flex items-center gap-2 py-5 text-xs text-subtle"
          >
            <span class="i-mdi-comment-outline size-4" aria-hidden="true" />
            {{ t('tasks.detail.noComments') }}
          </div>
        </div>
      </section>

      <footer class="task-comment-composer sticky bottom-0 shrink-0 px-4 py-3 sm:px-6">
        <div class="task-comment-composer__shell flex items-end gap-2">
          <TeaTextarea
            v-model="commentDraft"
            class="task-comment-composer__input min-w-0 flex-1"
            :label="t('tasks.detail.commentLabel')"
            :placeholder="t('tasks.detail.commentPlaceholder')"
            size="compact"
            auto-grow
            :rows="1"
            @keydown.meta.enter.prevent="addComment"
            @keydown.ctrl.enter.prevent="addComment"
          />
          <TeaIconButton
            class="task-comment-composer__send"
            icon="i-mdi-arrow-up"
            appearance="primary"
            size="small"
            :label="t('tasks.detail.comment')"
            :disabled="!commentDraft.trim()"
            @click="addComment"
          />
        </div>
      </footer>
    </div>
  </TeaDrawer>
</template>

<style scoped>
.task-comment-composer {
  border-top: 1px solid var(--tea-line-soft);
  background: var(--tea-canvas);
}

.task-comment-composer__shell {
  border: 1px solid var(--tea-line);
  border-radius: var(--tea-radius-card);
  background: var(--tea-canvas);
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
}

.task-comment-composer__input {
  min-height: 2.25rem;
  max-height: 7rem;
  resize: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0.375rem 0.25rem;
  box-shadow: none;
}

.task-comment-composer__input:focus {
  border-color: transparent;
  box-shadow: none;
  outline: none;
}

.task-comment-composer__send {
  margin-bottom: 0.125rem;
}
</style>
