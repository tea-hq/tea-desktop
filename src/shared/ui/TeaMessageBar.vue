<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'info' | 'success' | 'warning' | 'error'
    closable?: boolean
    closeLabel?: string
  }>(),
  { tone: 'info', closable: false, closeLabel: 'Close' },
)
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div
    :role="tone === 'error' || tone === 'warning' ? 'alert' : 'status'"
    :class="[
      'flex items-start gap-2 rounded-control px-3 py-2 text-sm leading-5',
      tone === 'info' && 'bg-accent/10 text-accent',
      tone === 'success' && 'bg-success-subtle text-success',
      tone === 'warning' && 'bg-warning-subtle text-warning',
      tone === 'error' && 'bg-danger-subtle text-danger',
    ]"
  >
    <span class="min-w-0 flex-1"><slot /></span>
    <button
      v-if="closable"
      type="button"
      class="inline-flex size-6 shrink-0 items-center justify-center rounded-structural text-current opacity-70 transition-colors hover:bg-hover hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current motion-reduce:transition-none"
      :aria-label="closeLabel"
      @click="emit('close')"
    >
      <span class="i-mdi-close size-4" aria-hidden="true" />
    </button>
  </div>
</template>
