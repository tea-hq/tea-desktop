<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    icon?: string
    tooltip?: string
    appearance?: 'secondary' | 'danger' | 'ghost'
    size?: 'small' | 'default'
    disabled?: boolean
  }>(),
  {
    icon: '',
    tooltip: '',
    appearance: 'ghost',
    size: 'default',
    disabled: false,
  },
)
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="tooltip || label"
    :disabled="disabled"
    :class="[
      'tea-icon-button inline-flex shrink-0 items-center justify-center border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
      size === 'small' ? 'size-8 rounded-structural' : 'size-9 rounded-control',
      appearance === 'secondary' &&
        'bg-panel text-fg hover:bg-hover active:bg-pressed focus-visible:outline-accent',
      appearance === 'danger' &&
        'bg-danger text-canvas hover:bg-danger/90 focus-visible:outline-danger',
      appearance === 'ghost' &&
        'bg-transparent text-dim hover:bg-hover hover:text-fg active:bg-pressed focus-visible:outline-accent',
    ]"
  >
    <slot><span :class="icon" aria-hidden="true" /></slot>
  </button>
</template>
