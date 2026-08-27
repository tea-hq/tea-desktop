<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaMenu, type TeaMenuItem } from '@/shared/ui'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'

const emit = defineEmits<{
  'add-to-current': []
  'select-conversation': [conversationId: string]
  'create-runtime': [runtimeId: string]
  'view-all': []
  close: []
}>()
const props = defineProps<{
  anchor: HTMLElement | null
  activeConversation: ConversationSummary | null
  recentConversations: ConversationSummary[]
  currentSessionAvailable: boolean
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId: string | null
}>()
const { t } = useI18n()
const menu = ref<InstanceType<typeof TeaMenu> | null>(null)
const items = computed<TeaMenuItem[]>(() => {
  const values: TeaMenuItem[] = []
  if (props.currentSessionAvailable && props.activeConversation) {
    values.push({
      value: 'current',
      label: `${t('channels.collaboration.currentSession')}: ${props.activeConversation.title || t('sidebar.untitled')}`,
      icon: 'i-mdi-creation-outline',
    })
  }
  values.push(...props.recentConversations.map(conversation => ({
    value: `conversation:${conversation.conversationId}`,
    label: conversation.title || t('sidebar.untitled'),
    icon: conversation.conversationId === props.activeConversation?.conversationId
      ? 'i-mdi-check'
      : 'i-mdi-message-text-outline',
  })))
  if (values.length && props.runtimes.length) {
    values.push({ value: 'separator:runtimes', label: '', separator: true })
  }
  values.push(...props.runtimes.map(runtime => ({
    value: `runtime:${runtime.id}`,
    label: runtime.id === props.defaultRuntimeId
      ? `${runtime.displayName} (${t('channels.collaboration.defaultLabel')})`
      : runtime.displayName,
    icon: 'i-mdi-creation-outline',
    disabled: runtime.status !== 'ready',
  })))
  if (props.recentConversations.length >= 4) {
    values.push({ value: 'all', label: t('channels.collaboration.viewAllSessions'), icon: 'i-mdi-view-list-outline' })
  }
  return values
})

function select(value: string): void {
  if (value === 'current') emit('add-to-current')
  else if (value === 'all') emit('view-all')
  else if (value.startsWith('conversation:')) emit('select-conversation', value.slice('conversation:'.length))
  else if (value.startsWith('runtime:')) emit('create-runtime', value.slice('runtime:'.length))
}

onMounted(async () => {
  await nextTick()
  if (props.anchor) menu.value?.show({ currentTarget: props.anchor } as unknown as Event)
})
</script>

<template>
  <TeaMenu ref="menu" popup :items="items" :label="t('channels.task.openMenu')" @select="select" @hide="emit('close')" />
</template>
