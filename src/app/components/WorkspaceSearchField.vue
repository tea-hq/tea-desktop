<script setup lang="ts">
import { TeaInput } from '@/shared/ui'

defineProps<{
  modelValue: string
  label: string
  statusLabel?: string
  statusClass?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="workspace-search-field relative w-full">
    <span
      class="i-mdi-magnify pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-subtle"
      aria-hidden="true"
    />
    <TeaInput
      :model-value="modelValue"
      size="small"
      type="search"
      class="workspace-search-field__input min-h-9 pl-9 pr-10 text-sm"
      :label="label"
      :placeholder="label"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <span
      v-if="statusLabel"
      role="img"
      class="pointer-events-none absolute right-3 top-1/2 z-10 size-1.5 -translate-y-1/2 rounded-full"
      :class="statusClass"
      :aria-label="statusLabel"
      :title="statusLabel"
    />
  </div>
</template>

<style scoped>
.workspace-search-field :deep(input[type='search']) {
  background: var(--tea-canvas);
  border-color: var(--tea-line);
}

.workspace-search-field :deep(input[type='search']:focus) {
  border-color: var(--tea-fg);
}
</style>
