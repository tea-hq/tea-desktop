<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>
<template>
  <Transition name="drawer"><aside v-if="open" class="absolute inset-y-0 right-0 z-20 flex w-full max-w-xl flex-col bg-white shadow-2xl" :aria-label="t('management.agentRoles.editorLabel')"><header class="flex shrink-0 items-center justify-between px-6 py-5"><div><p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{{ t('management.agentRoles.editorKicker') }}</p><h2 class="mt-1 text-lg font-semibold text-gray-900">{{ title }}</h2></div><button type="button" class="inline-flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" :title="t('management.agentRoles.closeEditor')" @click="emit('close')"><span class="i-mdi-close size-5" aria-hidden="true" /></button></header><div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8"><slot /></div><footer class="flex shrink-0 justify-end gap-2 bg-gray-50 px-6 py-4"><slot name="footer" /></footer></aside></Transition></template>
<style scoped>
.drawer-enter-active,.drawer-leave-active{transition:transform .22s ease,opacity .22s ease}.drawer-enter-from,.drawer-leave-to{transform:translateX(24px);opacity:0}
</style>
