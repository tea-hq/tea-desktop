<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  running?: boolean
  completed?: boolean
}>()

const { t } = useI18n()
const label = computed(() => (props.running ? t('sidebar.running') : t('sidebar.completed')))
</script>

<template>
  <span
    v-if="running"
    class="conversation-activity-indicator conversation-activity-indicator--running i-mdi-loading animate-spin"
    role="status"
    :aria-label="label"
    :title="label"
  />
  <span
    v-else-if="completed"
    class="conversation-activity-indicator conversation-activity-indicator--completed rounded-full bg-success"
    role="status"
    :aria-label="label"
    :title="label"
  />
</template>

<style scoped>
.conversation-activity-indicator {
  display: inline-block;
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
  color: var(--tea-accent);
}

.conversation-activity-indicator--completed {
  width: 0.375rem;
  height: 0.375rem;
  margin-inline: 0.25rem;
}

@media (prefers-reduced-motion: reduce) {
  .conversation-activity-indicator--running.animate-spin {
    animation: none;
  }
}
</style>
