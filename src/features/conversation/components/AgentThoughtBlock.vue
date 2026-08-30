<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import type { AgentThoughtBlock as AgentThoughtBlockModel } from '../contracts'

defineProps<{
  thought: AgentThoughtBlockModel
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="agent-thought w-full"
    :data-sequence="thought.sequence"
    :aria-label="t('messages.thought')"
    :aria-live="thought.streaming ? 'polite' : undefined"
  >
    <div class="agent-thought__heading">
      <span class="agent-thought__icon i-mdi-lightbulb-outline" aria-hidden="true" />
      <span>{{ t('messages.thought') }}</span>
      <span v-if="thought.streaming" class="agent-thought__status" aria-hidden="true">
        <span class="agent-thought__dot" />
        <span class="agent-thought__dot" />
        <span class="agent-thought__dot" />
      </span>
    </div>
    <MarkdownContent :source="thought.text" :streaming="thought.streaming" compact />
  </section>
</template>

<style scoped>
.agent-thought {
  min-width: 0;
  padding: 0.125rem 0 0.125rem 0.75rem;
  border-left: 2px solid var(--tea-line);
  color: var(--tea-dim);
}

.agent-thought__heading {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.25rem;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.4;
}

.agent-thought__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
}

.agent-thought__status {
  display: inline-flex;
  align-items: center;
  gap: 0.1875rem;
  margin-left: 0.125rem;
}

.agent-thought__dot {
  width: 0.1875rem;
  height: 0.1875rem;
  border-radius: 50%;
  background: currentColor;
  animation: agent-thought-pulse 1.2s ease-in-out infinite;
}

.agent-thought__dot:nth-child(2) {
  animation-delay: 150ms;
}

.agent-thought__dot:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes agent-thought-pulse {
  0%,
  60%,
  100% {
    opacity: 0.35;
  }

  30% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-thought__dot {
    animation: none;
    opacity: 0.65;
  }
}
</style>
