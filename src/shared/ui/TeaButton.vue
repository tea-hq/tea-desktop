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
      'tea-button inline-flex items-center justify-center gap-2 rounded-control border px-5 text-sm font-semibold leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed motion-reduce:transition-none',
      size === 'small' ? 'min-h-8 px-3' : 'min-h-10',
      fluid && 'w-full',
      appearance === 'primary' &&
        'border-accent bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:border-surface-strong disabled:bg-surface-strong disabled:text-subtle',
      appearance === 'secondary' &&
        'border-line-strong bg-canvas text-fg hover:bg-panel active:bg-muted disabled:border-line disabled:bg-panel disabled:text-disabled',
      appearance === 'danger' &&
        'border-danger bg-danger text-on-danger hover:bg-danger/90 focus-visible:outline-danger disabled:border-line disabled:bg-panel disabled:text-disabled',
      appearance === 'ghost' &&
        'border-transparent bg-transparent text-dim hover:bg-hover hover:text-fg active:bg-pressed disabled:text-disabled disabled:opacity-60',
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
