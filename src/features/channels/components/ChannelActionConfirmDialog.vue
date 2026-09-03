<script setup lang="ts">
import { TeaButton, TeaDialog } from '@/shared/ui'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel: string
    pending?: boolean
    danger?: boolean
  }>(),
  { pending: false, danger: false },
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <TeaDialog :open="open" :title="title" width="small" dismissable @close="emit('close')">
    <p class="text-sm leading-6 text-dim">{{ description }}</p>
    <template #footer>
      <TeaButton :disabled="pending" @click="emit('close')">{{ cancelLabel }}</TeaButton>
      <TeaButton
        :appearance="danger ? 'danger' : 'primary'"
        :loading="pending"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </TeaButton>
    </template>
  </TeaDialog>
</template>
