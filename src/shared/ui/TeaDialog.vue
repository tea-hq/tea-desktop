<script setup lang="ts">
import Dialog from 'primevue/dialog'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    dismissable?: boolean
    width?: 'small' | 'default' | 'large'
  }>(),
  { dismissable: false, width: 'default' },
)
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Dialog
    :visible="open"
    :header="title"
    modal
    block-scroll
    :draggable="false"
    :dismissable-mask="dismissable"
    :class="['tea-dialog', `tea-dialog--${width}`]"
    @update:visible="
      (value) => {
        if (!value) emit('close')
      }
    "
  >
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Dialog>
</template>

<style>
.tea-dialog {
  width: min(92vw, 34rem);
}
.tea-dialog--small {
  width: min(92vw, 26rem);
}
.tea-dialog--large {
  width: min(94vw, 52rem);
}
</style>
