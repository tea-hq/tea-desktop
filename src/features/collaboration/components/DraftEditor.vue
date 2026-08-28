<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Delivery, Draft } from '@/types/channelCollaboration'
import { TeaButton, TeaMessageBar, TeaTextarea } from '@/shared/ui'

const props = defineProps<{
  draft: Draft
  delivery?: Delivery
  busy?: boolean
  errorMessage?: string | null
}>()
const emit = defineEmits<{ save: [content: string]; deliver: [] }>()
const content = ref(props.draft.content)
const { t } = useI18n()
const isSent = () => props.delivery?.status === 'sent'

watch(
  () => props.draft.content,
  (value) => {
    content.value = value
  },
)
</script>

<template>
  <section class="tea-bg-muted px-3 py-3">
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="i-mdi-file-document-edit-outline size-4 tea-fg-muted" aria-hidden="true" />
        <p class="tea-text-caption tea-weight-strong tea-fg">
          {{ t('channels.collaboration.draftTitle') }}
        </p>
        <span class="tea-text-micro tea-fg-subtle">v{{ draft.currentVersion }}</span>
      </div>
      <span v-if="delivery" class="tea-text-micro tea-weight-medium tea-fg-muted">{{
        t(`channels.collaboration.delivery.${delivery.status}`)
      }}</span>
    </div>
    <TeaTextarea
      v-model="content"
      :label="t('channels.collaboration.draftTitle')"
      :rows="6"
      :readonly="isSent()"
    />
    <TeaMessageBar
      v-if="delivery?.status === 'failed' && (errorMessage || delivery.failureCode)"
      tone="error"
    >
      {{
        t('channels.collaboration.deliveryError', { reason: errorMessage || delivery.failureCode })
      }}
    </TeaMessageBar>
    <div v-if="!isSent()" class="mt-2 flex justify-end gap-2">
      <TeaButton
        :disabled="content === draft.content || !content.trim() || busy"
        @click="emit('save', content.trim())"
      >
        {{ t('channels.collaboration.saveDraft') }}
      </TeaButton>
      <TeaButton
        appearance="primary"
        :disabled="
          !content.trim() ||
          content !== draft.content ||
          busy ||
          delivery?.status === 'sent' ||
          delivery?.status === 'sending'
        "
        @click="emit('deliver')"
      >
        <span class="i-mdi-send size-3.5" aria-hidden="true" />
        {{ t('channels.collaboration.deliver') }}
      </TeaButton>
    </div>
  </section>
</template>
