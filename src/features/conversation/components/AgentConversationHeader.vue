<script setup lang="ts">
import { TeaIconButton } from '@/shared/ui'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    runtimeLabel?: string
    backLabel?: string
    expandLabel?: string
  }>(),
  { subtitle: '', runtimeLabel: '', backLabel: '', expandLabel: '' },
)
const emit = defineEmits<{ back: []; expand: [] }>()
</script>

<template>
  <header class="agent-header flex h-14 shrink-0 items-center gap-2 px-4">
    <TeaIconButton
      v-if="backLabel"
      :label="backLabel"
      icon="i-mdi-arrow-left"
      @click="emit('back')"
    />
    <div class="min-w-0 flex-1">
      <h2 class="truncate text-base font-semibold">{{ title }}</h2>
      <p v-if="subtitle" class="truncate text-sm">{{ subtitle }}</p>
    </div>
    <span v-if="runtimeLabel" class="truncate text-sm">{{ runtimeLabel }}</span>
    <TeaIconButton
      v-if="expandLabel"
      :label="expandLabel"
      icon="i-mdi-arrow-expand"
      @click="emit('expand')"
    />
  </header>
</template>

<style scoped>
.agent-header {
  border-bottom: 1px solid var(--tea-line);
  background: var(--tea-canvas);
  color: var(--text-fg);
}
.agent-header p,
.agent-header span {
  color: var(--tea-dim);
}
</style>
