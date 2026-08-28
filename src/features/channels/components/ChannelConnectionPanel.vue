<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TeaButton } from '@/shared/ui'
import type { ChannelStatus } from '../contracts'
import type {
  ManagedWorkspacePhase,
  RuntimeResourceStatus,
} from '@/features/managed-runtime/contracts'

defineProps<{
  status: ChannelStatus
  errorCode: string | null
  managedPhase: ManagedWorkspacePhase
  imStatus?: RuntimeResourceStatus
  pending: boolean
}>()
const emit = defineEmits<{
  retry: []
}>()
const { t } = useI18n()
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col bg-canvas">
    <div
      v-if="
        pending ||
        managedPhase === 'preparing' ||
        status.phase === 'connecting' ||
        status.phase === 'synchronizing' ||
        status.phase === 'reconnecting'
      "
      class="flex flex-1 items-center justify-center gap-2 text-base text-subtle"
    >
      <span class="i-mdi-loading size-5 animate-spin" aria-hidden="true" />
      {{
        t(
          managedPhase === 'preparing'
            ? 'channels.connection.preparing'
            : `channels.connection.${status.phase}`,
        )
      }}
    </div>
    <div
      v-else-if="status.phase === 'connected'"
      class="flex flex-1 flex-col items-center justify-center px-8 text-center"
    >
      <span class="i-mdi-message-outline size-7 text-disabled" aria-hidden="true" />
      <p class="mt-3 text-base font-medium text-dim">
        {{ t('channels.connection.noChannels') }}
      </p>
    </div>
    <div v-else class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-8">
      <div class="flex size-10 items-center justify-center rounded-card bg-muted text-dim">
        <span class="i-mdi-message-lock-outline size-5" aria-hidden="true" />
      </div>
      <h2 class="mt-4 text-xl font-semibold text-fg">
        {{
          t(
            imStatus === 'disabled'
              ? 'channels.connection.disabledTitle'
              : 'channels.connection.unavailableTitle',
          )
        }}
      </h2>
      <p class="mt-1 text-sm leading-5 text-subtle">
        {{
          t(
            imStatus === 'disabled'
              ? 'channels.connection.disabledDescription'
              : 'channels.connection.unavailableDescription',
          )
        }}
      </p>
      <p v-if="errorCode" class="mt-4 text-sm text-danger">
        {{ t('channels.connection.failed', { code: errorCode }) }}
      </p>
      <TeaButton
        v-if="imStatus !== 'disabled'"
        appearance="primary"
        class="mt-5 w-fit"
        :disabled="pending"
        @click="emit('retry')"
      >
        <span class="i-mdi-refresh size-4" aria-hidden="true" />
        {{ t('channels.connection.retry') }}
      </TeaButton>
    </div>
  </main>
</template>
