<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="flex min-w-0 flex-1 items-center justify-center tea-bg-canvas px-8 text-center">
    <div class="flex flex-col items-center">
      <span class="i-mdi-message-text-outline size-8 tea-fg-disabled" aria-hidden="true" />
      <p class="mt-3 tea-text-body tea-weight-medium tea-fg-subtle">{{ t('channels.selection.empty') }}</p>
    </div>
  </main>
</template>
