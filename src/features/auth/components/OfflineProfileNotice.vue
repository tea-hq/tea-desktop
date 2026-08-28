<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ lastValidatedAt: number | null }>()
const { t } = useI18n()
const timestamp = computed(() =>
  props.lastValidatedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(props.lastValidatedAt * 1000),
      )
    : t('auth.offline.unknownTime'),
)
</script>

<template>
  <div
    class="absolute inset-x-0 top-0 z-40 flex h-9 items-center justify-center gap-2 bg-inverse px-4 text-sm text-canvas"
    role="status"
  >
    <span class="i-mdi-cloud-off-outline size-4" aria-hidden="true" />
    <span>{{ t('auth.offline.notice', { time: timestamp }) }}</span>
  </div>
</template>
