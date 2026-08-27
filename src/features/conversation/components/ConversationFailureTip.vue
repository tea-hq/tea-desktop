<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { ConversationFailure } from '../contracts'

defineProps<{
  failure: ConversationFailure
}>()

const { t } = useI18n()
</script>

<template>
  <aside
    class="flex w-full items-start gap-3 tea-bg-canvas px-3 py-2.5 text-left"
    role="status"
  >
    <span class="mt-1 h-4 w-0.5 shrink-0 tea-bg-danger" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('messages.runNotice') }}</p>
      <p class="mt-0.5 tea-text-body leading-5 tea-fg">
        {{ t(`errors.failure.${failure.code}`) }}
      </p>
      <details v-if="failure.message" class="mt-1.5 tea-text-caption tea-fg-muted">
        <summary class="w-fit cursor-pointer list-none tea-fg-subtle tea-hover-fg">
          {{ t('errors.details') }}
        </summary>
        <p class="mt-1 whitespace-pre-wrap tea-mono tea-text-caption leading-5 tea-fg-muted">
          {{ failure.message }}
        </p>
      </details>
    </div>
  </aside>
</template>
