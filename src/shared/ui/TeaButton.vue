<script setup lang="ts">
withDefaults(
  defineProps<{
    appearance?: 'primary' | 'secondary' | 'danger' | 'ghost'
    size?: 'small' | 'default' | 'primary'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    fluid?: boolean
  }>(),
  {
    appearance: 'secondary',
    size: 'default',
    type: 'button',
    disabled: false,
    loading: false,
    fluid: false,
  },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :class="[
      'tea-button inline-flex items-center justify-center gap-2 border border-transparent px-3 font-medium leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
      size === 'small'
        ? 'min-h-8 rounded-structural text-xs'
        : size === 'primary'
          ? 'min-h-10 rounded-control'
          : 'min-h-9 rounded-control',
      fluid && 'w-full',
      appearance === 'primary' &&
        'bg-accent text-canvas hover:bg-accent-hover active:bg-accent-pressed focus-visible:outline-accent',
      appearance === 'secondary' &&
        'bg-panel text-fg hover:bg-hover active:bg-pressed focus-visible:outline-accent',
      appearance === 'danger' &&
        'bg-danger text-canvas hover:bg-danger/90 focus-visible:outline-danger',
      appearance === 'ghost' &&
        'bg-transparent text-dim hover:bg-hover hover:text-fg active:bg-pressed focus-visible:outline-accent',
    ]"
  >
    <span
      v-if="loading"
      class="i-mdi-loading size-4 animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
