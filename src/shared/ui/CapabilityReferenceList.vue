<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CapabilityReference } from '@/features/agent-roles/contracts'
defineProps<{ items: CapabilityReference[] }>()
const emit = defineEmits<{ remove: [index: number] }>()
const { t } = useI18n()
</script>
<template>
  <div class="space-y-2">
    <div v-if="items.length === 0" class="rounded-card bg-muted px-3 py-4 text-xs text-subtle">
      {{ t('management.agentRoles.capability.empty') }}
    </div>
    <div
      v-for="(item, index) in items"
      :key="`${item.kind}-${item.id}-${index}`"
      class="flex items-center gap-3 rounded-card bg-muted px-3 py-2.5"
    >
      <span
        class="size-2 rounded-full"
        :class="item.available === false ? 'bg-danger' : 'bg-disabled'"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1"
        ><span class="block truncate text-xs font-medium text-fg">{{ item.id }}</span
        ><span class="mt-0.5 block text-[11px] text-subtle"
          >{{ item.kind }}<span v-if="item.version"> · v{{ item.version }}</span
          ><span v-if="item.available === false">
            · {{ t('management.agentRoles.capability.unavailable') }}</span
          ></span
        ></span
      >
      <button
        type="button"
        class="inline-flex size-7 items-center justify-center rounded-full text-dim hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        :title="t('management.agentRoles.capability.remove')"
        @click="emit('remove', index)"
      >
        <span class="i-mdi-close size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
