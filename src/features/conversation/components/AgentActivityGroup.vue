<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton } from '@/shared/ui'
import type { ApprovalDecision, ConversationTurnBlock } from '../contracts'
import AgentThoughtBlock from './AgentThoughtBlock.vue'
import ToolCallBlock from './ToolCallBlock.vue'

type ActivityBlock = Extract<ConversationTurnBlock, { kind: 'agentThought' | 'toolCall' }>

const props = defineProps<{
  blocks: ActivityBlock[]
}>()

const emit = defineEmits<{
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
}>()

const { t } = useI18n()
const detailsOpen = ref(false)
const hasApproval = computed(() =>
  props.blocks.some((block) => block.kind === 'toolCall' && block.approval),
)
const expanded = computed(() => detailsOpen.value || hasApproval.value)
const summary = computed(() => t('messages.activitySummary', { count: props.blocks.length }))
const detailLabel = computed(() =>
  expanded.value ? t('messages.hideActivity') : t('messages.showActivity'),
)

watch(hasApproval, (value) => {
  if (value) detailsOpen.value = true
})
</script>

<template>
  <section class="agent-activity" :class="expanded ? 'agent-activity--expanded' : ''">
    <div class="agent-activity__heading">
      <span class="agent-activity__icon i-mdi-console-line" aria-hidden="true" />
      <span class="agent-activity__label">{{ summary }}</span>
      <TeaIconButton
        size="small"
        appearance="ghost"
        class="agent-activity__disclosure"
        :label="detailLabel"
        :tooltip="detailLabel"
        :aria-expanded="expanded"
        @click="detailsOpen = !detailsOpen"
      >
        <span
          class="i-mdi-chevron-down size-4 transition-transform"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </TeaIconButton>
    </div>

    <div v-if="expanded" class="agent-activity__details">
      <template v-for="block in blocks" :key="block.id">
        <AgentThoughtBlock v-if="block.kind === 'agentThought'" :thought="block" />
        <ToolCallBlock
          v-else
          :tool="block"
          :data-sequence="block.sequence"
          @resolve-approval="emit('resolveApproval', $event)"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.agent-activity {
  min-width: 0;
  color: var(--tea-dim);
}

.agent-activity__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.75rem;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.4;
}

.agent-activity__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
}

.agent-activity__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-activity__disclosure {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  margin: -0.375rem 0 -0.375rem auto;
  border-radius: var(--tea-radius-inline);
  color: var(--tea-subtle);
}

.agent-activity__disclosure:hover {
  background: var(--tea-hover);
  color: var(--tea-fg);
}

.agent-activity__disclosure:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}

.agent-activity__details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.25rem 0 0 1.25rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--tea-line);
}
</style>
