<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="flex min-w-0 flex-1 items-center justify-center bg-canvas px-6 text-center">
    <div class="flex max-w-xs flex-col items-center">
      <span class="i-mdi-message-text-outline size-6 text-disabled" aria-hidden="true" />
      <p class="mt-2 text-sm font-medium text-subtle">
        {{ t('channels.selection.empty') }}
      </p>
    </div>
  </main>
</template>
