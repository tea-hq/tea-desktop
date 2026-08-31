<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton } from '@/shared/ui'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import type { TaskNotification } from '../taskNotification'

const props = defineProps<{
  notification: TaskNotification
}>()

const { t } = useI18n()
const detailsOpen = ref(false)
const statusKey = computed(() => {
  const status = props.notification.status?.trim().toLowerCase()
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'stopped' || status === 'cancelled') return 'stopped'
  return 'unknown'
})
const statusLabel = computed(() => t(`messages.taskNotification.status.${statusKey.value}`))
const summary = computed(
  () => props.notification.summary?.trim() || t('messages.taskNotification.title'),
)
const details = computed<Array<{ key: string; label: string; value: string }>>(() => {
  const candidates: Array<{ key: string; label: string; value: string | null }> = [
    {
      key: 'taskId',
      label: t('messages.taskNotification.fields.taskId'),
      value: props.notification.taskId,
    },
    {
      key: 'toolUseId',
      label: t('messages.taskNotification.fields.toolUseId'),
      value: props.notification.toolUseId,
    },
    {
      key: 'outputFile',
      label: t('messages.taskNotification.fields.outputFile'),
      value: props.notification.outputFile,
    },
    {
      key: 'status',
      label: t('messages.taskNotification.fields.status'),
      value: props.notification.status,
    },
    {
      key: 'summary',
      label: t('messages.taskNotification.fields.summary'),
      value: props.notification.summary,
    },
  ]
  return candidates.flatMap(({ key, label, value }) => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized ? [{ key, label, value: normalized }] : []
  })
})
const hasResult = computed(() => Boolean(props.notification.resultText.trim()))
const hasDetails = computed(() => details.value.length > 0 || hasResult.value)
const detailLabel = computed(() =>
  detailsOpen.value
    ? t('messages.taskNotification.collapse')
    : t('messages.taskNotification.expand'),
)
</script>

<template>
  <section
    class="task-notification-fold"
    :class="`task-notification-fold--${statusKey}`"
    data-testid="task-notification-fold"
  >
    <div class="task-notification-fold__row">
      <span class="task-notification-fold__icon i-mdi-bell-outline" aria-hidden="true" />
      <div class="task-notification-fold__copy">
        <span class="task-notification-fold__status">{{ statusLabel }}</span>
        <span class="task-notification-fold__separator" aria-hidden="true">·</span>
        <span class="task-notification-fold__summary">{{ summary }}</span>
      </div>
      <TeaIconButton
        v-if="hasDetails"
        size="small"
        appearance="ghost"
        class="task-notification-fold__disclosure"
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

    <div v-if="hasDetails && detailsOpen" class="task-notification-fold__details">
      <dl v-if="details.length" class="task-notification-fold__fields">
        <div v-for="field in details" :key="field.key" class="task-notification-fold__field">
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      </dl>
      <MarkdownContent v-if="hasResult" :source="notification.resultText" compact />
    </div>
  </section>
</template>

<style scoped>
.task-notification-fold {
  min-width: 0;
  color: var(--tea-dim);
}

.task-notification-fold__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.75rem;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.4;
}

.task-notification-fold__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
}

.task-notification-fold__copy {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.25rem;
}

.task-notification-fold__status,
.task-notification-fold__separator {
  flex: 0 0 auto;
}

.task-notification-fold__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-notification-fold__disclosure {
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

.task-notification-fold__disclosure:hover {
  background: var(--tea-hover);
  color: var(--tea-fg);
}

.task-notification-fold__disclosure:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}

.task-notification-fold__details {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin: 0.25rem 0 0 1.25rem;
  padding: 0.625rem 0.75rem;
  border-left: 1px solid var(--tea-line);
  background: var(--tea-panel);
  overflow-wrap: anywhere;
  font-size: 0.75rem;
  line-height: 1.5;
}

.task-notification-fold__fields {
  display: grid;
  gap: 0.25rem;
  margin: 0;
}

.task-notification-fold__field {
  display: grid;
  grid-template-columns: minmax(5rem, auto) minmax(0, 1fr);
  gap: 0.75rem;
}

.task-notification-fold__field dt {
  color: var(--tea-subtle);
}

.task-notification-fold__field dd {
  min-width: 0;
  margin: 0;
  color: var(--tea-dim);
  font-family: var(--font-mono);
  white-space: pre-wrap;
}

.task-notification-fold--failed .task-notification-fold__status {
  color: var(--tea-danger);
}

.task-notification-fold--completed .task-notification-fold__status {
  color: var(--tea-success);
}
</style>
