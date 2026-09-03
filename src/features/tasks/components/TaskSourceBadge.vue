<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskSource } from '../contracts'

const props = withDefaults(defineProps<{ source: TaskSource; compact?: boolean }>(), {
  compact: false,
})
const { t } = useI18n()

const icon = computed(() => {
  const sourceName = props.source.name.toLocaleLowerCase()
  if (sourceName.includes('github')) return 'i-mdi-github'
  if (sourceName.includes('jira')) return 'i-mdi-jira'
  if (sourceName.includes('monitor')) return 'i-mdi-chart-timeline-variant-shimmer'
  if (props.source.kind === 'plugin') return 'i-mdi-puzzle-outline'
  if (props.source.kind === 'message') return 'i-mdi-message-text-outline'
  return 'i-mdi-laptop'
})

const label = computed(() => t(`tasks.sources.${props.source.kind}`))
</script>

<template>
  <span
    :class="compact ? 'size-5 justify-center rounded-inline bg-muted' : 'min-w-0 gap-1.5'"
    class="inline-flex shrink-0 items-center text-xs text-dim"
    :title="`${label}: ${source.name}`"
  >
    <span
      :class="[
        icon,
        compact ? 'size-3.5' : 'size-4',
        'shrink-0',
        source.kind === 'plugin'
          ? 'text-brand-accent'
          : source.kind === 'message'
            ? 'text-success'
            : 'text-subtle',
      ]"
      aria-hidden="true"
    />
    <span v-if="!compact" class="truncate">{{ source.name }}</span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
