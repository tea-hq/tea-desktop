<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaDialog } from '@/shared/ui'
import type { Message } from '../contracts'
import ChannelMessageItem from './ChannelMessageItem.vue'

const props = defineProps<{
  open: boolean
  message: Message | null
  items: Message[]
  loading: boolean
  errorCode: string | null
  canGoBack: boolean
}>()
const emit = defineEmits<{
  close: []
  retry: []
  back: []
  openMerged: [message: Message]
}>()
const { t } = useI18n()
const title = computed(() =>
  props.message?.content.kind === 'merged' && props.message.content.sourceChannelName
    ? t('channels.merged.title', { source: props.message.content.sourceChannelName })
    : t('channels.merged.chatHistory'),
)
</script>

<template>
  <TeaDialog
    :open="open"
    :title="title"
    :close-label="t('common.close')"
    width="large"
    dismissable
    @close="emit('close')"
  >
    <div v-if="canGoBack" class="mb-3 border-b border-line-soft pb-3">
      <TeaButton appearance="ghost" size="small" @click="emit('back')">
        <span class="i-mdi-arrow-left size-4" aria-hidden="true" />
        {{ t('channels.merged.back') }}
      </TeaButton>
    </div>
    <div
      v-if="loading"
      class="flex min-h-56 flex-col items-center justify-center gap-2 text-sm text-subtle"
      role="status"
    >
      <span
        class="i-mdi-loading size-5 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {{ t('channels.merged.loading') }}
    </div>
    <div
      v-else-if="errorCode"
      class="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center"
      role="alert"
    >
      <span class="i-mdi-alert-circle-outline size-6 text-danger" aria-hidden="true" />
      <p class="text-sm text-dim">{{ t('channels.merged.error', { code: errorCode }) }}</p>
      <TeaButton size="small" @click="emit('retry')">{{ t('common.retry') }}</TeaButton>
    </div>
    <div
      v-else-if="items.length === 0"
      class="flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-subtle"
    >
      <span class="i-mdi-message-off-outline size-6 text-disabled" aria-hidden="true" />
      {{ t('channels.merged.empty') }}
    </div>
    <div v-else class="mx-auto max-w-3xl divide-y divide-line-soft">
      <ChannelMessageItem
        v-for="(item, index) in items"
        :key="item.ref.messageServerId || item.ref.messageClientId"
        :message="item"
        :menu-open-up="index >= items.length - 2"
        :active-conversation="null"
        :recent-conversations="[]"
        :current-session-available="false"
        :runtimes="[]"
        :default-runtime-id="null"
        :interactive="false"
        @open-merged="emit('openMerged', item)"
      />
    </div>
  </TeaDialog>
</template>
