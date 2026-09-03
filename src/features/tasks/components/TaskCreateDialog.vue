<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaDialog, TeaInput, TeaSelect } from '@/shared/ui'
import type { TeaSelectOption } from '@/shared/ui'
import type { NewLocalTask, TaskPriority } from '../contracts'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; create: [input: NewLocalTask] }>()
const { t } = useI18n()
const title = ref('')
const priority = ref<TaskPriority>('medium')
const dueLabel = ref('')
const attempted = ref(false)

const priorityOptions = computed<TeaSelectOption<TaskPriority>[]>(() => [
  { value: 'high', label: t('tasks.priority.high') },
  { value: 'medium', label: t('tasks.priority.medium') },
  { value: 'low', label: t('tasks.priority.low') },
])
const dueOptions = computed<TeaSelectOption<string>[]>(() => [
  { value: t('tasks.dates.today'), label: t('tasks.dates.today') },
  { value: t('tasks.dates.tomorrow'), label: t('tasks.dates.tomorrow') },
  { value: t('tasks.dates.nextMonday'), label: t('tasks.dates.nextMonday') },
  { value: t('tasks.dates.noDate'), label: t('tasks.dates.noDate') },
])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    title.value = ''
    priority.value = 'medium'
    dueLabel.value = t('tasks.dates.tomorrow')
    attempted.value = false
  },
)

function submit(): void {
  attempted.value = true
  if (!title.value.trim()) return
  emit('create', {
    title: title.value,
    priority: priority.value,
    dueLabel: dueLabel.value,
  })
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="t('tasks.create.title')"
    :close-label="t('tasks.create.close')"
    dismissable
    width="small"
    @close="emit('close')"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-dim">{{ t('tasks.create.name') }}</span>
        <TeaInput
          v-model="title"
          :label="t('tasks.create.name')"
          :placeholder="t('tasks.create.namePlaceholder')"
          :invalid="attempted && !title.trim()"
        />
        <span v-if="attempted && !title.trim()" class="mt-1.5 block text-xs text-danger">
          {{ t('tasks.create.nameRequired') }}
        </span>
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="min-w-0">
          <span class="mb-1.5 block text-xs font-medium text-dim">
            {{ t('tasks.columns.priority') }}
          </span>
          <TeaSelect
            v-model="priority"
            :options="priorityOptions"
            :label="t('tasks.columns.priority')"
            appearance="field"
          />
        </label>
        <label class="min-w-0">
          <span class="mb-1.5 block text-xs font-medium text-dim">
            {{ t('tasks.columns.due') }}
          </span>
          <TeaSelect
            v-model="dueLabel"
            :options="dueOptions"
            :label="t('tasks.columns.due')"
            appearance="field"
          />
        </label>
      </div>

      <div class="flex items-center gap-3 border-t border-line-soft pt-4">
        <span class="i-mdi-laptop size-5 text-subtle" aria-hidden="true" />
        <span class="min-w-0">
          <span class="block text-xs font-medium text-fg">{{
            t('tasks.sources.localWorkspace')
          }}</span>
          <span class="block truncate text-[11px] text-subtle">{{
            t('tasks.create.sourceContext')
          }}</span>
        </span>
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <TeaButton appearance="ghost" @click="emit('close')">{{
          t('tasks.create.cancel')
        }}</TeaButton>
        <TeaButton type="submit" appearance="primary">
          <span class="i-mdi-plus size-4" aria-hidden="true" />
          {{ t('tasks.create.submit') }}
        </TeaButton>
      </div>
    </form>
  </TeaDialog>
</template>
