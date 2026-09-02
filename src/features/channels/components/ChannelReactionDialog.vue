<script setup lang="ts">
import { TeaButton, TeaDialog } from '@/shared/ui'
import type { Message } from '../contracts'

const props = defineProps<{
  open: boolean
  message: Message | null
  pending?: boolean
  options: readonly { type: number; label: string }[]
  title: string
  closeLabel: string
}>()
const emit = defineEmits<{
  close: []
  select: [type: number, active: boolean]
}>()

function active(type: number): boolean {
  return (
    props.message?.reactions.some((reaction) => reaction.type === type && reaction.active) ?? false
  )
}
</script>

<template>
  <TeaDialog :open="open" :title="title" width="small" dismissable @close="emit('close')">
    <div class="grid grid-cols-3 gap-2" role="listbox" :aria-label="title">
      <TeaButton
        v-for="option in options"
        :key="option.type"
        appearance="ghost"
        class="min-h-12 flex-col gap-1 border border-line"
        :class="active(option.type) ? 'bg-hover text-fg' : 'text-dim'"
        :disabled="pending || !message"
        :aria-selected="active(option.type)"
        @click="emit('select', option.type, !active(option.type))"
      >
        <span class="text-xl leading-none" aria-hidden="true">{{ option.label }}</span>
        <span class="sr-only">{{ option.type }}</span>
      </TeaButton>
    </div>
    <template #footer>
      <TeaButton :disabled="pending" @click="emit('close')">{{ closeLabel }}</TeaButton>
    </template>
  </TeaDialog>
</template>
