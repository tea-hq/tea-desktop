<script setup lang="ts">
import { TeaIconButton } from '@/shared/ui'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    runtimeLabel?: string
    backLabel?: string
    expandLabel?: string
    closeLabel?: string
    compact?: boolean
  }>(),
  {
    subtitle: '',
    runtimeLabel: '',
    backLabel: '',
    expandLabel: '',
    closeLabel: '',
    compact: false,
  },
)
const emit = defineEmits<{ close: []; back: []; expand: [] }>()
</script>

<template>
  <header
    :class="[
      'agent-header flex shrink-0 items-center gap-1.5',
      compact ? 'min-h-12 px-3 py-1.5 sm:px-4' : 'min-h-16 px-4 py-3 sm:px-5',
    ]"
  >
    <TeaIconButton
      v-if="backLabel"
      :label="backLabel"
      icon="i-mdi-arrow-left"
      :size="compact ? 'small' : 'default'"
      class="agent-header__back"
      @click="emit('back')"
    />
    <div class="min-w-0 flex-1">
      <h2 class="truncate text-[15px] font-semibold leading-5 text-fg">{{ title }}</h2>
      <p v-if="subtitle" class="mt-0.5 truncate text-xs leading-4">{{ subtitle }}</p>
    </div>
    <span v-if="runtimeLabel" class="agent-header__runtime">
      <span class="i-mdi-robot-outline size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ runtimeLabel }}</span>
    </span>
    <TeaIconButton
      v-if="expandLabel"
      :label="expandLabel"
      icon="i-mdi-arrow-expand"
      :size="compact ? 'small' : 'default'"
      @click="emit('expand')"
    />
    <TeaIconButton
      v-if="closeLabel"
      :label="closeLabel"
      icon="i-mdi-close"
      :size="compact ? 'small' : 'default'"
      @click="emit('close')"
    />
  </header>
</template>

<style scoped>
.agent-header {
  border-bottom: 1px solid var(--tea-line-soft);
  background: var(--tea-panel);
  color: var(--tea-fg);
}
.agent-header p {
  color: var(--tea-dim);
}
.agent-header__runtime {
  display: inline-flex;
  min-width: 0;
  max-width: 12rem;
  flex: 0 1 auto;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--tea-line);
  border-radius: var(--tea-radius-pill);
  background: var(--tea-canvas);
  padding: 0.375rem 0.625rem;
  color: var(--tea-dim);
  font-size: 0.75rem;
  line-height: 1;
}
.agent-header__runtime > span:first-child {
  color: var(--tea-subtle);
}
.agent-header__back {
  margin-left: -0.25rem;
}
</style>
