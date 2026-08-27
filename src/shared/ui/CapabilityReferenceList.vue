<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CapabilityReference } from '@/features/agent-roles/contracts'
defineProps<{ items: CapabilityReference[] }>()
const emit = defineEmits<{ remove: [index: number] }>()
const { t } = useI18n()
</script>
<template>
  <div class="space-y-2">
    <div v-if="items.length === 0" class="rounded-lg bg-gray-50 px-3 py-4 text-xs text-gray-400">{{ t('management.agentRoles.capability.empty') }}</div>
    <div v-for="(item, index) in items" :key="`${item.kind}-${item.id}-${index}`" class="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
      <span class="size-2 rounded-full" :class="item.available === false ? 'bg-red-400' : 'bg-gray-300'" aria-hidden="true" />
      <span class="min-w-0 flex-1"><span class="block truncate text-xs font-medium text-gray-700">{{ item.id }}</span><span class="mt-0.5 block text-[11px] text-gray-400">{{ item.kind }}<span v-if="item.version"> · v{{ item.version }}</span><span v-if="item.available === false"> · {{ t('management.agentRoles.capability.unavailable') }}</span></span></span>
      <button type="button" class="inline-flex size-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700" :title="t('management.agentRoles.capability.remove')" @click="emit('remove', index)"><span class="i-mdi-close size-4" aria-hidden="true" /></button>
    </div>
  </div>
</template>
