<script setup lang="ts">
import Button from 'primevue/button'

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
  <Button
    v-tooltip="tooltip || label"
    type="button"
    icon-only
    :aria-label="label"
    :disabled="disabled"
    :severity="appearance === 'danger' ? 'danger' : 'secondary'"
    :variant="appearance === 'ghost' ? 'text' : undefined"
    :size="size === 'small' ? 'small' : undefined"
    :class="['tea-icon-button', `tea-icon-button--${size}`]"
  >
    <slot><span :class="icon" aria-hidden="true" /></slot>
  </Button>
</template>

<style scoped>
.tea-icon-button {
  width: var(--tea-control-height, 2.25rem);
  height: var(--tea-control-height, 2.25rem);
}
.tea-icon-button--small {
  width: var(--tea-control-height-small, 2rem);
  height: var(--tea-control-height-small, 2rem);
}
</style>
