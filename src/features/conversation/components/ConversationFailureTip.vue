<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { ConversationFailure } from '../contracts'

defineProps<{
  failure: ConversationFailure
}>()

const { t } = useI18n()
</script>

<template>
  <aside class="flex w-full items-start gap-3 bg-canvas px-3 py-2.5 text-left" role="status">
    <span class="mt-1 h-4 w-0.5 shrink-0 bg-danger" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-subtle">{{ t('messages.runNotice') }}</p>
      <p class="mt-0.5 text-base leading-5 text-fg">
        {{ t(`errors.failure.${failure.code}`) }}
      </p>
      <details v-if="failure.message" class="mt-1.5 text-sm text-dim">
        <summary class="w-fit cursor-pointer list-none text-subtle hover:text-fg">
          {{ t('errors.details') }}
        </summary>
        <p class="mt-1 whitespace-pre-wrap font-mono text-sm leading-5 text-dim">
          {{ failure.message }}
        </p>
      </details>
    </div>
  </aside>
</template>
