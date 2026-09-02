<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  tenantName: string
  totalCount: number
}>()

const { t } = useI18n()
</script>

<template>
  <aside
    class="hidden w-[220px] shrink-0 flex-col border-r border-line-soft bg-canvas md:flex"
    data-testid="directory-scope"
  >
    <div class="px-5 pb-3 pt-5">
      <p class="text-xs font-semibold text-subtle">{{ t('directory.organization') }}</p>
      <div class="mt-3 flex min-w-0 items-center gap-2.5 text-sm font-semibold text-fg">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-control bg-panel text-dim"
          aria-hidden="true"
        >
          <span class="i-mdi-domain size-4" />
        </span>
        <span class="truncate" :title="tenantName">{{ tenantName }}</span>
      </div>
    </div>

    <nav class="px-3" :aria-label="t('directory.organization')">
      <div
        class="flex min-h-10 items-center gap-2 rounded-control bg-panel px-3 text-sm font-medium text-fg"
        aria-current="page"
      >
        <span class="i-mdi-account-multiple-outline size-4 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('directory.allMembers') }}</span>
        <span class="shrink-0 text-xs tabular-nums text-subtle">{{ totalCount }}</span>
      </div>
    </nav>
  </aside>
</template>
