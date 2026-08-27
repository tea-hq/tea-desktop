<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ChannelSourceInput } from '@/types/channelCollaboration'
import ChannelSourceCard from './ChannelSourceCard.vue'

defineProps<{ sources: ChannelSourceInput[] }>()
const emit = defineEmits<{ remove: [messageClientId: string] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="sources.length" class="tea-bg-canvas px-3 pb-2 pt-2">
    <div class="mb-1.5 flex items-center justify-between">
      <p class="tea-text-micro tea-weight-strong uppercase tea-fg-subtle">{{ t('channels.collaboration.sources', { count: sources.length }) }}</p>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-1">
      <ChannelSourceCard
        v-for="source in sources"
        :key="source.messageRef.messageServerId || source.messageRef.messageClientId"
        class="w-52 shrink-0"
        :source="source"
        removable
        @remove="emit('remove', source.messageRef.messageClientId)"
      />
    </div>
  </div>
</template>
