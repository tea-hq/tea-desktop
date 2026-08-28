<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    icon?: string
    tooltip?: string
    appearance?: 'primary' | 'secondary' | 'danger' | 'ghost'
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
      'tea-icon-button inline-flex shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none',
      size === 'small' ? 'size-8' : 'size-9',
      appearance === 'primary' &&
        'border-accent bg-accent text-canvas hover:bg-accent-hover active:bg-accent-pressed',
      appearance === 'secondary' &&
        'border-line-strong bg-canvas text-fg hover:bg-panel active:bg-muted',
      appearance === 'danger' &&
        'bg-danger text-canvas hover:bg-danger/90 focus-visible:outline-danger',
      appearance === 'ghost' &&
        'border-transparent bg-transparent text-dim hover:bg-hover hover:text-fg active:bg-pressed',
    ]"
  >
    <slot><span :class="icon" aria-hidden="true" /></slot>
  </button>
</template>
