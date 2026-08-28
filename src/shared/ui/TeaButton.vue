<script setup lang="ts">
import Button from 'primevue/button'

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
  <Button
    :type="type"
    :disabled="disabled || loading"
    :severity="
      appearance === 'danger'
        ? 'danger'
        : appearance === 'secondary' || appearance === 'ghost'
          ? 'secondary'
          : undefined
    "
    :variant="appearance === 'ghost' ? 'text' : undefined"
    :size="size === 'small' ? 'small' : undefined"
    :fluid="fluid"
    :aria-busy="loading || undefined"
    :class="['tea-button', `tea-button--${size}`]"
  >
    <span v-if="loading" class="i-mdi-loading tea-button__spinner" aria-hidden="true" />
    <slot />
  </Button>
</template>

<style scoped>
.tea-button {
  min-height: var(--tea-control-height, 2.25rem);
}
.tea-button--small {
  min-height: var(--tea-control-height-small, 2rem);
}
.tea-button--primary {
  min-height: var(--tea-control-height-primary, 2.5rem);
}
.tea-button__spinner {
  width: 1rem;
  height: 1rem;
  animation: tea-spin 800ms linear infinite;
}
@keyframes tea-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tea-button__spinner {
    animation-duration: 1600ms;
  }
}
</style>
