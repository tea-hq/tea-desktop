<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

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
const statusDot = computed(() => {
  if (props.tool.status === 'failed') return 'tea-bg-danger'
  if (props.tool.status === 'completed') return 'tea-bg-success'
  if (props.tool.status === 'approvalRequired') return 'tea-bg-warning'
  if (props.tool.status === 'cancelled') return 'tea-bg-disabled'
  return 'tea-bg-disabled animate-pulse'
})
</script>

<template>
  <section class="w-full tea-bg-canvas px-3 py-2.5 tea-text-caption tea-fg-muted" :data-tool-call-id="tool.id">
    <div class="flex min-h-5 min-w-0 items-center gap-2">
      <span class="h-1.5 w-1.5 shrink-0 tea-radius-pill" :class="statusDot" aria-hidden="true" />
      <code class="shrink-0 tea-mono tea-text-caption tea-weight-medium tea-fg">{{ tool.name }}</code>
      <span class="shrink-0 tea-text-caption tea-fg-subtle">{{ t(`tools.status.${tool.status}`) }}</span>
      <span v-if="tool.message" class="min-w-0 truncate tea-text-caption tea-fg-subtle">
        {{ tool.message }}
      </span>
      <TeaButton
        v-if="hasArguments"
        type="button"
        class="ml-auto flex h-6 shrink-0 items-center gap-1 px-1 tea-text-caption tea-fg-subtle transition-colors tea-hover-bg tea-hover-fg"
        :aria-expanded="detailsOpen"
        @click="detailsOpen = !detailsOpen"
      >
        {{ t('tools.details') }}
        <svg
          class="h-3 w-3 transition-transform"
          :class="detailsOpen ? 'rotate-180' : ''"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="m4.5 6 3.5 3.5L11.5 6" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </TeaButton>
    </div>

    <pre
      v-if="hasArguments && detailsOpen"
      class="mt-2 max-h-48 w-full overflow-auto tea-bg-subtle px-2.5 py-2 tea-mono tea-text-caption leading-5 tea-fg-muted"
    >{{ JSON.stringify(tool.arguments, null, 2) }}</pre>

    <ApprovalPrompt
      v-if="tool.approval"
      :request="tool.approval"
      @decide="emit('resolveApproval', { approvalId: tool.approval!.id, decision: $event })"
    />
  </section>
</template>
