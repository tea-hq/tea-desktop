<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageContent } from '../contracts'

const props = withDefaults(
  defineProps<{
    content: Extract<MessageContent, { kind: 'merged' }>
    interactive?: boolean
  }>(),
  { interactive: true },
)
const emit = defineEmits<{ open: [] }>()
const { t } = useI18n()
const title = computed(() => props.content.sourceChannelName || t('channels.merged.defaultSource'))

function open(event: MouseEvent): void {
  if (!props.interactive) return
  event.stopPropagation()
  emit('open')
}
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="block w-[min(28rem,70vw)] max-w-full text-left"
    :class="
      interactive
        ? 'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2'
        : ''
    "
    :aria-label="interactive ? t('channels.merged.open', { source: title }) : undefined"
    @click="open"
  >
    <span class="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
      <span class="i-mdi-message-text-clock-outline size-4 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ title }}</span>
    </span>
    <span v-if="content.abstracts.length" class="mt-2 block space-y-1 text-xs leading-5 text-dim">
      <span
        v-for="(item, index) in content.abstracts"
        :key="`${item.senderAccountId}:${index}`"
        class="block truncate"
      >
        <span class="font-semibold text-fg">{{ item.senderName }}:</span>
        {{ item.text }}
      </span>
    </span>
    <span
      class="mt-2 flex items-center justify-between border-t border-line-soft pt-2 text-xs text-subtle"
    >
      <span>{{ t('channels.merged.chatHistory') }}</span>
      <span class="i-mdi-chevron-right size-4" aria-hidden="true" />
    </span>
  </component>
</template>
