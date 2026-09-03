<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaDrawer, TeaIconButton, TeaInput, TeaSelect, TeaTextarea } from '@/shared/ui'
import type { TeaSelectOption } from '@/shared/ui'
import type { TaskItem, TaskStatus } from '../contracts'
import TaskSourceBadge from './TaskSourceBadge.vue'

const props = defineProps<{ task: TaskItem | null }>()
const emit = defineEmits<{
  close: []
  'update-status': [taskId: string, status: TaskStatus]
  'add-tag': [taskId: string, tag: string]
  'remove-tag': [taskId: string, tag: string]
  'add-comment': [taskId: string, body: string]
}>()
const { t } = useI18n()
const tagDraft = ref('')
const commentDraft = ref('')

const statusOptions = computed<TeaSelectOption<TaskStatus>[]>(() => [
  { value: 'inbox', label: t('tasks.status.inbox') },
  { value: 'inProgress', label: t('tasks.status.inProgress') },
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
</script>

<template>
  <TeaDrawer
    :open="Boolean(task)"
    :title="task?.title ?? t('tasks.detail.title')"
    :close-label="t('tasks.detail.close')"
    width="wide"
    resizable
    :default-width="620"
    :min-width="360"
    :max-width="760"
    :resize-label="t('tasks.detail.resize')"
    :show-header="false"
    @close="emit('close')"
  >
    <div v-if="task" class="flex min-h-full flex-col" data-testid="task-detail">
      <header class="border-b border-line px-5 pb-5 pt-4 sm:px-6 sm:pt-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span class="font-mono text-xs text-subtle">{{ task.id }}</span>
              <TaskSourceBadge :source="task.source" />
            </div>
            <h2 class="mt-3 text-xl font-semibold leading-7 tracking-normal text-fg sm:text-[22px]">
              {{ task.title }}
            </h2>
          </div>
          <TeaIconButton
            icon="i-mdi-close"
            :label="t('tasks.detail.close')"
            @click="emit('close')"
          />
        </div>
        <p class="mt-3 text-sm leading-6 text-dim">{{ task.description }}</p>
      </header>

      <div class="divide-y divide-line-soft">
        <section class="grid grid-cols-2 gap-x-5 gap-y-5 px-5 py-5 sm:grid-cols-3 sm:px-6">
          <label class="min-w-0">
            <span class="mb-1.5 block text-xs font-medium text-subtle">
              {{ t('tasks.columns.status') }}
            </span>
            <TeaSelect
              :model-value="task.status"
              :options="statusOptions"
              :label="t('tasks.detail.changeStatus')"
              size="small"
              @update:model-value="updateStatus"
            />
          </label>
          <div>
            <span class="block text-xs font-medium text-subtle">{{
              t('tasks.columns.priority')
            }}</span>
            <span class="mt-2 block text-sm font-medium text-fg">
              {{ t(`tasks.priority.${task.priority}`) }}
            </span>
          </div>
          <div>
            <span class="block text-xs font-medium text-subtle">{{
              t('tasks.columns.assignee')
            }}</span>
            <span class="mt-2 flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-dim"
                aria-hidden="true"
              >
                {{ Array.from(task.assignee).slice(0, 1).join('').toLocaleUpperCase() }}
              </span>
              <span class="truncate">{{ task.assignee }}</span>
            </span>
          </div>
          <div>
            <span class="block text-xs font-medium text-subtle">{{ t('tasks.columns.due') }}</span>
            <span class="mt-2 block text-sm text-fg">{{ task.dueLabel }}</span>
          </div>
          <div class="col-span-2 sm:col-span-2">
            <span class="flex items-center justify-between text-xs font-medium text-subtle">
              <span>{{ t('tasks.columns.progress') }}</span>
              <span class="font-mono">{{ task.progress }}%</span>
            </span>
            <span
              class="mt-2 block h-2 overflow-hidden rounded-pill bg-muted"
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
          </div>
        </section>

        <section class="px-5 py-5 sm:px-6">
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-sm font-semibold text-fg">{{ t('tasks.detail.source') }}</h3>
            <span class="text-xs text-subtle">{{ t(`tasks.sources.${task.source.kind}`) }}</span>
          </div>
          <div class="mt-3 flex min-w-0 items-center gap-3 border-l-2 border-line-strong pl-3">
            <span
              :class="
                task.source.kind === 'plugin'
                  ? 'i-mdi-puzzle-outline text-brand-accent'
                  : task.source.kind === 'message'
                    ? 'i-mdi-message-text-outline text-success'
                    : 'i-mdi-laptop text-subtle'
              "
              class="size-5 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-fg">{{ task.source.name }}</span>
              <span class="mt-0.5 block truncate text-xs text-subtle">{{
                task.source.context
              }}</span>
            </span>
          </div>
        </section>

        <section class="px-5 py-5 sm:px-6">
          <h3 class="text-sm font-semibold text-fg">{{ t('tasks.detail.tags') }}</h3>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="tag in task.tags"
              :key="tag"
              type="button"
              class="inline-flex min-h-7 items-center gap-1 rounded-pill bg-muted px-2.5 text-xs font-medium text-dim transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-focus motion-reduce:transition-none"
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
          </div>
          <div class="mt-3 flex items-center gap-2">
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
        </section>

        <section class="px-5 py-5 sm:px-6">
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-sm font-semibold text-fg">{{ t('tasks.detail.activity') }}</h3>
            <span class="text-xs text-subtle">{{
              t('tasks.detail.updated', { time: task.updatedAtLabel })
            }}</span>
          </div>

          <div class="mt-4 space-y-4">
            <div
              v-for="comment in task.comments"
              :key="comment.id"
              class="flex items-start gap-3"
              data-testid="task-comment"
            >
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-dim"
                aria-hidden="true"
              >
                {{ Array.from(comment.author).slice(0, 1).join('').toLocaleUpperCase() }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span class="text-xs font-semibold text-fg">{{ comment.author }}</span>
                  <span class="text-[11px] text-subtle">{{ comment.createdAtLabel }}</span>
                </div>
                <p class="mt-1 text-sm leading-5 text-dim">{{ comment.body }}</p>
              </div>
            </div>
            <p v-if="task.comments.length === 0" class="text-xs text-subtle">
              {{ t('tasks.detail.noComments') }}
            </p>
          </div>

          <div class="mt-5 border-t border-line-soft pt-4">
            <TeaTextarea
              v-model="commentDraft"
              :label="t('tasks.detail.commentLabel')"
              :placeholder="t('tasks.detail.commentPlaceholder')"
              size="compact"
              :rows="2"
            />
            <div class="mt-2 flex justify-end">
              <TeaButton
                appearance="primary"
                size="small"
                :disabled="!commentDraft.trim()"
                @click="addComment"
              >
                <span class="i-mdi-send-outline size-4" aria-hidden="true" />
                {{ t('tasks.detail.comment') }}
              </TeaButton>
            </div>
          </div>
        </section>
      </div>
    </div>
  </TeaDrawer>
</template>
