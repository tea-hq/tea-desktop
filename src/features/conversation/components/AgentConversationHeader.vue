<script setup lang="ts">
import { TeaIconButton } from '@/shared/ui'

withDefaults(defineProps<{
  title: string
  subtitle?: string
  runtimeLabel?: string
  backLabel?: string
  expandLabel?: string
}>(), { subtitle: '', runtimeLabel: '', backLabel: '', expandLabel: '' })
const emit = defineEmits<{ back: []; expand: [] }>()
</script>

<template>
  <header class="agent-header flex h-14 shrink-0 items-center gap-2 px-4">
    <TeaIconButton v-if="backLabel" :label="backLabel" icon="i-mdi-arrow-left" @click="emit('back')" />
    <div class="min-w-0 flex-1">
      <h2 class="truncate tea-text-body tea-weight-strong">{{ title }}</h2>
      <p v-if="subtitle" class="truncate tea-text-caption">{{ subtitle }}</p>
    </div>
    <span v-if="runtimeLabel" class="truncate tea-text-caption">{{ runtimeLabel }}</span>
    <TeaIconButton v-if="expandLabel" :label="expandLabel" icon="i-mdi-arrow-expand" @click="emit('expand')" />
  </header>
</template>

<style scoped>
.agent-header { border-bottom: 1px solid var(--p-content-border-color); background: var(--p-content-background); color: var(--p-text-color); }
.agent-header p,.agent-header span { color: var(--p-text-muted-color); }
</style>
