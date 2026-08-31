<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="agent-working-indicator" role="status" aria-live="polite">
    <span class="agent-working-indicator__icon i-mdi-loading animate-spin" aria-hidden="true" />
    <span class="agent-working-indicator__label animate-pulse">{{ label }}</span>
  </div>
</template>

<style scoped>
.agent-working-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.4;
}

.agent-working-indicator__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
}

.agent-working-indicator__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .agent-working-indicator__icon.animate-spin,
  .agent-working-indicator__label.animate-pulse {
    animation: none;
  }
}
</style>
