<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaDialog } from '@/shared/ui'
import type { Delivery, Draft } from '@/types/channelCollaboration'
import DraftEditor from './DraftEditor.vue'
defineProps<{
  open: boolean
  draft: Draft | null
  delivery?: Delivery
  busy?: boolean
  errorMessage?: string | null
}>()
const emit = defineEmits<{ close: []; save: [content: string]; deliver: [] }>()
const { t } = useI18n()
</script>
<template>
  <TeaDialog
    :open="open"
    :title="t('channels.collaboration.draftTitle')"
    :close-label="t('common.close')"
    width="large"
    @close="emit('close')"
  >
    <DraftEditor
      v-if="draft"
      :draft="draft"
      :delivery="delivery"
      :busy="busy"
      :error-message="errorMessage"
      @save="emit('save', $event)"
      @deliver="emit('deliver')"
    />
  </TeaDialog>
</template>
