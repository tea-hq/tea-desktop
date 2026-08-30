<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaEmptyState, TeaIconButton } from '@/shared/ui'
import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import AgentRuntimeMenu from '@/features/conversation/components/AgentRuntimeMenu.vue'

const props = defineProps<{
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId?: string | null
}>()
const emit = defineEmits<{ create: []; createWithRuntime: [runtimeId: string] }>()
const { t } = useI18n()
const selectedRuntime = () =>
  props.runtimes.find((value) => value.id === props.defaultRuntimeId && value.status === 'ready') ??
  props.runtimes.find((value) => value.status === 'ready')
const canCreate = () => selectedRuntime()?.status === 'ready'
</script>
<template>
  <TeaEmptyState
    :title="t('channels.collaboration.noConversations')"
    :description="t('channels.collaboration.emptyDescription')"
    icon="i-mdi-message-plus-outline"
  >
    <template #actions>
      <div class="flex w-64 max-w-full flex-col items-center gap-2">
        <div class="flex items-center gap-1">
          <TeaIconButton
            :label="t('channels.collaboration.newSession')"
            icon="i-mdi-plus"
            :disabled="!canCreate()"
            @click="emit('create')"
          />
          <AgentRuntimeMenu
            v-if="runtimes.length > 1"
            :runtimes="runtimes"
            :default-runtime-id="defaultRuntimeId"
            :label="t('channels.collaboration.chooseOtherAgent')"
            :menu-label="t('channels.collaboration.chooseAgent')"
            @select="emit('createWithRuntime', $event)"
          />
        </div>
      </div>
    </template>
  </TeaEmptyState>
</template>
