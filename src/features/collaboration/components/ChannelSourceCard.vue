<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaIconButton } from '@/shared/ui'
import type { ChannelSourceInput } from '@/types/channelCollaboration'

defineProps<{ source: ChannelSourceInput; removable?: boolean }>()
const emit = defineEmits<{ remove: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-w-0 items-start gap-2 rounded-card bg-panel px-2.5 py-2">
    <span
      class="i-mdi-message-text-outline mt-0.5 size-3.5 shrink-0 text-subtle"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-semibold text-fg">{{ source.senderName }}</p>
      <p class="mt-0.5 line-clamp-2 text-sm leading-4 text-dim">
        {{ source.state === 'revoked' ? t('channels.message.revoked') : source.text }}
      </p>
    </div>
    <TeaIconButton
      v-if="removable"
      size="small"
      :label="t('channels.collaboration.removeSource')"
      icon="i-mdi-close"
      @click="emit('remove')"
    />
  </div>
</template>
