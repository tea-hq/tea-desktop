<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaEmptyState, TeaSelect } from '@/shared/ui'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
const props = defineProps<{ runtimes: RuntimeDescriptor[]; runtimeId: string | null }>()
const emit = defineEmits<{ create: []; selectRuntime: [id: string] }>()
const { t } = useI18n()
const options = computed(() =>
  props.runtimes.map((value) => ({
    value: value.id,
    label: value.displayName,
    disabled: value.status !== 'ready',
  })),
)
const selectedRuntime = computed(() => props.runtimes.find((value) => value.id === props.runtimeId))
</script>
<template>
  <TeaEmptyState
    :title="t('channels.collaboration.noConversations')"
    :description="t('channels.collaboration.emptyDescription')"
    icon="i-mdi-creation-outline"
  >
    <template #actions
      ><div class="grid min-w-64 gap-2">
        <TeaSelect
          :model-value="runtimeId"
          :options="options"
          :label="t('channels.collaboration.chooseAgent')"
          @update:model-value="$event && emit('selectRuntime', String($event))"
        /><TeaButton
          appearance="primary"
          :disabled="!selectedRuntime || selectedRuntime.status !== 'ready'"
          @click="emit('create')"
          >{{
            t('channels.collaboration.useDefaultToCreate', {
              runtime: selectedRuntime?.displayName ?? t('channels.collaboration.defaultAgent'),
            })
          }}</TeaButton
        >
      </div></template
    >
  </TeaEmptyState>
</template>
