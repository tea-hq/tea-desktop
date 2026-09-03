<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { TaskApprovalRequest } from '../contracts'
import TaskActorAvatar from './TaskActorAvatar.vue'

defineProps<{ request: TaskApprovalRequest }>()
const { t } = useI18n()

const steps = [
  { key: 'reading', icon: 'i-mdi-text-search' },
  { key: 'planning', icon: 'i-mdi-file-edit-outline' },
  { key: 'continuing', icon: 'i-mdi-play-circle-outline' },
] as const
</script>

<template>
  <div
    class="mt-3 rounded-card border border-line-soft bg-canvas px-4 py-3"
    role="status"
    aria-live="polite"
    :aria-label="t('tasks.approval.agentProcessing')"
    data-testid="task-agent-handoff"
  >
    <div class="flex items-start gap-3">
      <TaskActorAvatar :actor="request.requester" size="small" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span
            class="i-mdi-loading size-4 shrink-0 animate-spin text-subtle motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p class="truncate text-xs font-semibold text-fg">
            {{ t('tasks.approval.agentProcessing') }}
          </p>
        </div>
        <p class="mt-1 text-xs leading-5 text-subtle">
          {{ t('tasks.approval.agentProcessingDescription', { name: request.requester.name }) }}
        </p>
      </div>
    </div>

    <ol class="mt-3 grid gap-2 border-t border-line-soft pt-3 sm:grid-cols-3 sm:gap-3">
      <li
        v-for="(step, index) in steps"
        :key="step.key"
        class="task-agent-handoff__step flex min-w-0 items-center gap-2 text-xs text-subtle"
        :style="{ '--step-delay': `${index * 0.35}s` }"
        :data-step="step.key"
      >
        <span :class="step.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ t(`tasks.approval.agentSteps.${step.key}`) }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
@keyframes taskAgentHandoffStep {
  0%,
  100% {
    color: var(--tea-subtle);
    opacity: 0.55;
  }

  24%,
  48% {
    color: var(--tea-fg);
    opacity: 1;
  }
}

.task-agent-handoff__step {
  animation: taskAgentHandoffStep 3.6s ease-in-out infinite;
  animation-delay: var(--step-delay);
}

@media (prefers-reduced-motion: reduce) {
  .task-agent-handoff__step {
    animation: none;
    color: var(--tea-fg);
    opacity: 1;
  }
}
</style>
