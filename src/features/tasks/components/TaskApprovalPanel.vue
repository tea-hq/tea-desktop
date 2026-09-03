<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaChoiceButton, TeaTextarea } from '@/shared/ui'
import type { TaskApprovalAnswer, TaskApprovalRequest, TaskApprovalSubmission } from '../contracts'
import TaskAgentHandoff from './TaskAgentHandoff.vue'
import TaskActorAvatar from './TaskActorAvatar.vue'

const props = defineProps<{ request: TaskApprovalRequest }>()
const emit = defineEmits<{
  submit: [submission: TaskApprovalSubmission]
}>()
const { t } = useI18n()

const singleAnswer = ref<string | null>(null)
const booleanAnswer = ref<boolean | null>(null)
const multipleAnswer = ref(new Set<string>())
const customReply = ref('')
const customReplyOpen = ref(false)

const canSubmit = computed(() => createAnswer() !== null)
const replyPlaceholder = computed(() => {
  const question = props.request.question
  if (question.kind === 'text') return question.placeholder
  return question.customReplyPlaceholder ?? t('tasks.approval.customReplyPlaceholder')
})

watch(
  () => props.request.id,
  () => {
    singleAnswer.value = null
    booleanAnswer.value = null
    multipleAnswer.value = new Set()
    customReply.value = ''
    customReplyOpen.value = props.request.question.kind === 'text'
  },
  { immediate: true },
)

function clearCustomReply(): void {
  customReply.value = ''
  customReplyOpen.value = false
}

function selectSingle(optionId: string): void {
  singleAnswer.value = optionId
  clearCustomReply()
}

function selectBoolean(value: boolean): void {
  booleanAnswer.value = value
  clearCustomReply()
}

function toggleMultiple(optionId: string): void {
  const selected = new Set(multipleAnswer.value)
  if (selected.has(optionId)) selected.delete(optionId)
  else selected.add(optionId)
  multipleAnswer.value = selected
  clearCustomReply()
}

function updateCustomReply(value: string): void {
  customReply.value = value
  if (!value.trim()) return
  singleAnswer.value = null
  booleanAnswer.value = null
  multipleAnswer.value = new Set()
}

function createAnswer(): TaskApprovalAnswer | null {
  const question = props.request.question
  const reply = customReply.value.trim()
  if (question.kind === 'text') {
    return reply ? { questionId: question.id, kind: 'text', value: reply } : null
  }
  if (reply) return { questionId: question.id, kind: 'custom', value: reply }
  if (question.kind === 'single' && singleAnswer.value) {
    return { questionId: question.id, kind: 'single', optionIds: [singleAnswer.value] }
  }
  if (question.kind === 'boolean' && booleanAnswer.value !== null) {
    return { questionId: question.id, kind: 'boolean', value: booleanAnswer.value }
  }
  if (question.kind === 'multiple' && multipleAnswer.value.size > 0) {
    return { questionId: question.id, kind: 'multiple', optionIds: [...multipleAnswer.value] }
  }
  return null
}

function submit(): void {
  const answer = createAnswer()
  if (!answer) return
  emit('submit', { requestId: props.request.id, answer })
}
</script>

<template>
  <section
    class="shrink-0 border-b border-line-soft px-5 py-4 sm:px-6"
    :aria-label="t('tasks.approval.title')"
    data-testid="task-approval-panel"
    :data-approval-status="request.status"
  >
    <template v-if="request.status === 'submitted'">
      <div
        class="flex items-start gap-3 rounded-card bg-success-subtle px-4 py-3 text-success"
        data-testid="task-approval-submitted"
      >
        <span class="i-mdi-check-circle-outline mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div class="min-w-0">
          <h3 class="text-sm font-semibold">{{ t('tasks.approval.submittedTitle') }}</h3>
          <p class="mt-1 text-xs leading-5">
            {{ t('tasks.approval.submittedDescription', { name: request.requester.name }) }}
          </p>
          <p v-if="request.respondedAtLabel" class="mt-1 font-mono text-xs opacity-80">
            {{ request.respondedAtLabel }}
          </p>
        </div>
      </div>
      <TaskAgentHandoff :request="request" />
    </template>

    <div v-else class="overflow-hidden rounded-card border border-line bg-panel">
      <div class="border-b border-line px-4 py-3.5">
        <div class="flex items-start gap-3">
          <TaskActorAvatar :actor="request.requester" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold text-fg">{{ request.title }}</h3>
              <span
                class="rounded-pill bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger"
              >
                {{ t('tasks.approval.waitingForYou') }}
              </span>
            </div>
            <p class="mt-1 text-xs leading-5 text-dim">{{ request.description }}</p>
            <p class="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
              <span>{{ t('tasks.approval.requestedBy', { name: request.requester.name }) }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ request.createdAtLabel }}</span>
            </p>
          </div>
        </div>
      </div>

      <fieldset
        class="min-w-0 px-4 py-4"
        :data-approval-question="request.question.id"
        :data-question-kind="request.question.kind"
      >
        <legend class="w-full pt-4">
          <span class="flex items-start gap-2.5">
            <span
              class="i-mdi-help-circle-outline mt-0.5 size-5 shrink-0 text-subtle"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-fg">{{ request.question.prompt }}</span>
              <span
                v-if="request.question.description"
                class="mt-1 block text-xs leading-5 text-subtle"
              >
                {{ request.question.description }}
              </span>
            </span>
          </span>
        </legend>

        <div
          v-if="request.question.kind === 'single'"
          class="mt-3 grid gap-2 sm:ml-7"
          role="radiogroup"
          :aria-label="request.question.prompt"
        >
          <TeaChoiceButton
            v-for="option in request.question.options"
            :key="option.id"
            v-slot="{ selected }"
            control-role="radio"
            :selected="singleAnswer === option.id"
            :data-option-id="option.id"
            @select="selectSingle(option.id)"
          >
            <span
              :class="
                selected ? 'i-mdi-radiobox-marked text-fg' : 'i-mdi-radiobox-blank text-subtle'
              "
              class="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0">
              <span class="block text-xs font-semibold">{{ option.label }}</span>
              <span v-if="option.description" class="mt-0.5 block text-xs leading-4 text-subtle">
                {{ option.description }}
              </span>
            </span>
          </TeaChoiceButton>
        </div>

        <div
          v-else-if="request.question.kind === 'boolean'"
          class="mt-3 grid grid-cols-2 gap-2 sm:ml-7 sm:max-w-72"
          role="radiogroup"
          :aria-label="request.question.prompt"
        >
          <TeaChoiceButton
            v-for="choice in [
              { value: true, label: t('tasks.approval.yes'), icon: 'i-mdi-check' },
              { value: false, label: t('tasks.approval.no'), icon: 'i-mdi-close' },
            ]"
            :key="String(choice.value)"
            control-role="radio"
            appearance="segment"
            :selected="booleanAnswer === choice.value"
            :data-boolean-value="String(choice.value)"
            @select="selectBoolean(choice.value)"
          >
            <span :class="[choice.icon, 'size-4']" aria-hidden="true" />
            {{ choice.label }}
          </TeaChoiceButton>
        </div>

        <div
          v-else-if="request.question.kind === 'multiple'"
          class="mt-3 grid gap-2 sm:ml-7 sm:grid-cols-2"
          role="group"
          :aria-label="request.question.prompt"
        >
          <TeaChoiceButton
            v-for="option in request.question.options"
            :key="option.id"
            v-slot="{ selected }"
            control-role="checkbox"
            appearance="compact"
            :selected="multipleAnswer.has(option.id)"
            :data-option-id="option.id"
            @select="toggleMultiple(option.id)"
          >
            <span
              :class="
                selected
                  ? 'i-mdi-checkbox-marked text-fg'
                  : 'i-mdi-checkbox-blank-outline text-subtle'
              "
              class="size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{{ option.label }}</span>
          </TeaChoiceButton>
        </div>

        <div
          v-if="request.question.kind === 'text' || customReplyOpen"
          class="mt-3 sm:ml-7"
          data-testid="task-approval-custom-reply"
        >
          <TeaTextarea
            :model-value="customReply"
            :label="t('tasks.approval.customReply')"
            :placeholder="replyPlaceholder"
            :rows="2"
            size="compact"
            auto-grow
            @update:model-value="updateCustomReply"
          />
        </div>

        <div v-else-if="request.question.allowCustomReply" class="mt-2 flex justify-end sm:ml-7">
          <TeaButton
            appearance="ghost"
            size="small"
            data-testid="task-approval-custom-toggle"
            @click="customReplyOpen = true"
          >
            <span class="i-mdi-message-text-outline size-4" aria-hidden="true" />
            {{ t('tasks.approval.customReply') }}
          </TeaButton>
        </div>
      </fieldset>

      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas px-4 py-3"
      >
        <span class="flex items-center gap-2 text-xs text-subtle" aria-live="polite">
          <span
            :class="canSubmit ? 'i-mdi-check-circle text-success' : 'i-mdi-circle-outline'"
            class="size-4"
            aria-hidden="true"
          />
          {{ canSubmit ? t('tasks.approval.ready') : t('tasks.approval.chooseOne') }}
        </span>
        <TeaButton
          appearance="primary"
          size="small"
          :disabled="!canSubmit"
          data-testid="task-approval-submit"
          @click="submit"
        >
          <span class="i-mdi-send-check-outline size-4" aria-hidden="true" />
          {{ t('tasks.approval.submit') }}
        </TeaButton>
      </div>
    </div>
  </section>
</template>
