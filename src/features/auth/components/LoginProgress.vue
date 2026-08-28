<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CenterAuthPhase } from '../contracts'

defineProps<{ phase: CenterAuthPhase }>()
const { t } = useI18n()
</script>

<template>
  <div
    class="flex h-12 items-center gap-3 tea-bg-subtle px-4 tea-text-body tea-fg-muted"
    role="status"
  >
    <span class="i-mdi-loading size-4 shrink-0 animate-spin tea-fg-subtle" aria-hidden="true" />
    <span>{{ t(`auth.progress.${phase}`) }}</span>
  </div>
</template>
