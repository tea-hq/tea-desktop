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
  if (props.tool.status === 'failed') return 'bg-danger'
  if (props.tool.status === 'completed') return 'bg-success'
  if (props.tool.status === 'approvalRequired') return 'bg-warning'
  if (props.tool.status === 'cancelled') return 'bg-muted'
  return 'bg-muted animate-pulse'
})
</script>

<template>
  <section
    class="w-full rounded-card border border-line bg-canvas px-3.5 py-3 text-sm text-dim"
    :data-tool-call-id="tool.id"
  >
    <div class="flex min-h-5 min-w-0 items-center gap-2">
      <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="statusDot" aria-hidden="true" />
      <code class="shrink-0 font-mono text-sm font-medium text-fg">{{ tool.name }}</code>
      <span class="shrink-0 text-sm text-subtle">{{ t(`tools.status.${tool.status}`) }}</span>
      <span v-if="tool.message" class="min-w-0 truncate text-sm text-subtle">
        {{ tool.message }}
      </span>
      <TeaButton
        v-if="hasArguments"
        type="button"
        appearance="ghost"
        size="small"
        class="ml-auto shrink-0"
        :aria-expanded="detailsOpen"
        @click="detailsOpen = !detailsOpen"
      >
        {{ t('tools.details') }}
        <span
          class="i-mdi-chevron-down size-4 transition-transform"
          :class="detailsOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </TeaButton>
    </div>

    <pre
      v-if="hasArguments && detailsOpen"
      class="mt-2 max-h-48 w-full overflow-auto rounded-menu bg-panel px-3 py-2.5 font-mono text-sm leading-5 text-dim"
      >{{ JSON.stringify(tool.arguments, null, 2) }}</pre>

    <ApprovalPrompt
      v-if="tool.approval"
      :request="tool.approval"
      @decide="emit('resolveApproval', { approvalId: tool.approval!.id, decision: $event })"
    />
  </section>
</template>
