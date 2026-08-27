<script setup lang="ts">
import Message from 'primevue/message'

withDefaults(defineProps<{
  tone?: 'info' | 'success' | 'warning' | 'error'
  closable?: boolean
}>(), { tone: 'info', closable: false })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Message
    :severity="tone === 'warning' ? 'warn' : tone"
    :closable="closable"
    size="small"
    @close="emit('close')"
  ><slot /></Message>
</template>
