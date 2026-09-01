<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton } from '@/shared/ui'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import type { AgentThoughtBlock as AgentThoughtBlockModel } from '../contracts'

const props = defineProps<{
  thought: AgentThoughtBlockModel
  presentation?: 'default' | 'activity'
}>()

const { t } = useI18n()
const detailsOpen = ref(false)
const detailLabel = computed(() =>
  detailsOpen.value ? t('messages.hideThought') : t('messages.showThought'),
)
const activityLabel = computed(() => {
  const text = props.thought.text.replace(/\s+/g, ' ').trim()
  return text || t('messages.thought')
})
</script>

<template>
  <section
    class="agent-thought w-full text-sm text-dim"
    :class="presentation === 'activity' ? 'agent-thought--activity' : ''"
    :data-sequence="thought.sequence"
  >
    <div class="agent-thought__heading">
      <span
        class="agent-thought__icon i-mdi-lightbulb-outline"
        :class="thought.streaming ? 'animate-pulse' : ''"
        aria-hidden="true"
      />
      <span class="agent-thought__label">
        {{ presentation === 'activity' ? activityLabel : t('messages.thought') }}
      </span>
      <span v-if="thought.streaming" class="agent-thought__status">
        {{ t('messages.status.running') }}
      </span>
      <TeaIconButton
        size="small"
        appearance="ghost"
        class="agent-thought__disclosure"
        :label="detailLabel"
        :tooltip="detailLabel"
        :aria-expanded="detailsOpen"
        @click="detailsOpen = !detailsOpen"
      >
        <span
          class="i-mdi-chevron-down size-4 transition-transform"
          :class="detailsOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </TeaIconButton>
    </div>
    <div v-if="detailsOpen" class="agent-thought__details max-h-48 overflow-auto">
      <MarkdownContent :source="thought.text" :streaming="thought.streaming" compact />
    </div>
  </section>
</template>

<style scoped>
.agent-thought {
  min-width: 0;
  padding: 0.125rem 0;
}

.agent-thought__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.4;
}

.agent-thought__icon {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  margin-top: 0.125rem;
}

.agent-thought__status {
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.45;
}

.agent-thought__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-thought--activity .agent-thought__label {
  overflow-wrap: anywhere;
  white-space: normal;
}

.agent-thought__disclosure {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  margin: -0.375rem 0 -0.375rem auto;
  border-radius: var(--tea-radius-inline);
  color: var(--tea-subtle);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.agent-thought__disclosure:hover {
  background: var(--tea-hover);
  color: var(--tea-fg);
}

.agent-thought__disclosure:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}

.agent-thought__details {
  box-sizing: border-box;
  width: auto;
  margin: 0.5rem 1.5rem 0 1.5rem;
  padding: 0.625rem 0.75rem;
  border-left: 1px solid var(--tea-line);
  background: var(--tea-panel);
  overflow-wrap: anywhere;
}

.agent-thought--activity {
  padding: 0.125rem 0;
}
</style>
