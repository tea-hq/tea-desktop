<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaIconButton } from '@/shared/ui'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'

import type { ApprovalDecision, ToolCallBlock } from '../contracts'
import ApprovalPrompt from './ApprovalPrompt.vue'

const props = defineProps<{
  tool: ToolCallBlock
}>()

const emit = defineEmits<{
  resolveApproval: [payload: { approvalId: string; decision: ApprovalDecision }]
}>()

const { t } = useI18n()
const detailsOpen = ref(false)
const hasArguments = computed(() => props.tool.arguments !== undefined)
const hasMessage = computed(() => Boolean(props.tool.message?.trim()))
const hasDetails = computed(() => hasArguments.value || hasMessage.value)
const activityIcon = computed(() => {
  const name = props.tool.name.toLowerCase()
  if (/(browser|web|url|page)/.test(name)) return 'i-mdi-web'
  if (/(edit|write|patch|update|delete)/.test(name)) return 'i-mdi-file-edit-outline'
  if (/(read|file|workspace|path)/.test(name)) return 'i-mdi-file-document-outline'
  if (/(terminal|command|shell|exec|run)/.test(name)) return 'i-mdi-console-line'
  if (/(search|find|grep|query)/.test(name)) return 'i-mdi-magnify'
  return 'i-mdi-wrench-outline'
})
const activityIconClass = computed(() => [
  activityIcon.value,
  props.tool.status === 'running' || props.tool.status === 'requested' ? 'animate-pulse' : '',
])
const detailLabel = computed(() =>
  detailsOpen.value ? t('tools.hideDetails') : t('tools.showDetails'),
)
</script>

<template>
  <section
    class="tool-event w-full text-sm text-dim"
    :class="`tool-event--${tool.status}`"
    :data-tool-call-id="tool.id"
  >
    <div class="tool-event__row">
      <span class="tool-event__icon" :class="activityIconClass" aria-hidden="true" />
      <div class="tool-event__copy">
        <div class="tool-event__heading">
          <code class="tool-event__name">{{ tool.name }}</code>
          <span class="tool-event__status">{{ t(`tools.status.${tool.status}`) }}</span>
        </div>
      </div>
      <TeaIconButton
        v-if="hasDetails"
        size="small"
        appearance="ghost"
        class="tool-event__disclosure"
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

    <div
      v-if="hasDetails && detailsOpen"
      class="tool-event__details max-h-48 overflow-auto rounded-menu text-sm leading-5 text-dim"
    >
      <MarkdownContent v-if="hasMessage" :source="tool.message ?? ''" compact />
      <pre v-if="hasArguments" class="tool-event__arguments font-mono">{{
        JSON.stringify(tool.arguments, null, 2)
      }}</pre>
    </div>

    <ApprovalPrompt
      v-if="tool.approval"
      :request="tool.approval"
      @decide="emit('resolveApproval', { approvalId: tool.approval!.id, decision: $event })"
    />
  </section>
</template>

<style scoped>
.tool-event {
  min-width: 0;
  padding: 0.125rem 0;
}

.tool-event__row {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.5rem;
}

.tool-event__icon {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  margin-top: 0.125rem;
  color: var(--tea-subtle);
}

.tool-event__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.tool-event__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.tool-event__name {
  min-width: 0;
  overflow: hidden;
  color: var(--tea-dim);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-event__status {
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.45;
}

.tool-event__disclosure {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  margin-top: -0.375rem;
  border-radius: var(--tea-radius-inline);
  color: var(--tea-subtle);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.tool-event__disclosure:hover {
  background: var(--tea-hover);
  color: var(--tea-fg);
}

.tool-event__disclosure:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}

.tool-event__details {
  box-sizing: border-box;
  width: auto;
  margin: 0.5rem 1.5rem 0 1.5rem;
  padding: 0.625rem 0.75rem;
  border-left: 1px solid var(--tea-line);
  background: var(--tea-panel);
  overflow-wrap: anywhere;
}

.tool-event__arguments {
  margin: 0.5rem 0 0;
  white-space: pre-wrap;
}

@media (prefers-reduced-motion: reduce) {
  .tool-event__disclosure {
    transition: none;
  }

  .tool-event__icon.animate-pulse {
    animation: none;
  }
}
</style>
