<script setup lang="ts">
import Drawer from 'primevue/drawer'

withDefaults(defineProps<{
  open: boolean
  title: string
  dismissable?: boolean
  width?: 'default' | 'wide'
}>(), { dismissable: true, width: 'default' })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Drawer
    :visible="open"
    :header="title"
    position="right"
    modal
    block-scroll
    :dismissable="dismissable"
    :class="['tea-drawer', `tea-drawer--${width}`]"
    @update:visible="value => { if (!value) emit('close') }"
  >
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Drawer>
</template>

<style>
.tea-drawer { width: min(92vw, 30rem) !important; }
.tea-drawer--wide { width: min(94vw, 42rem) !important; }
</style>
