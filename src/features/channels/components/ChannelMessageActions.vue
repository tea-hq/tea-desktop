<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import { TeaIconButton, TeaMenu, type TeaMenuItem } from '@/shared/ui'
import ChannelAgentMenu from './ChannelAgentMenu.vue'

type MessageAction = 'reply' | 'forward' | 'reaction' | 'revoke' | 'delete'
type OpenMenu = 'agent' | 'more'

const props = defineProps<{
  openUp: boolean
  sentByCurrentUser: boolean
  messageState: 'active' | 'revoked'
  activeConversation: ConversationSummary | null
  recentConversations: ConversationSummary[]
  currentSessionAvailable: boolean
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId: string | null
}>()

const emit = defineEmits<{
  action: [action: MessageAction]
  forwardToAgent: [action: 'current' | 'conversation' | 'runtime' | 'all', id?: string]
}>()
const { t } = useI18n()
const activeMenu = ref<OpenMenu | null>(null)
const agentMenuAnchor = ref<HTMLElement | null>(null)
const moreMenuAnchor = ref<HTMLElement | null>(null)
const moreMenu = ref<InstanceType<typeof TeaMenu> | null>(null)

const moreMenuItems = computed<TeaMenuItem[]>(() => {
  const items: TeaMenuItem[] = []
  if (props.messageState === 'active') {
    items.push(
      { value: 'reply', label: t('channels.message.reply'), icon: 'i-mdi-reply-outline' },
      { value: 'forward', label: t('channels.message.forward'), icon: 'i-mdi-forward' },
      {
        value: 'reaction',
        label: t('channels.message.quickReaction'),
        icon: 'i-mdi-emoticon-plus-outline',
      },
      { value: 'separator:destructive', label: '', separator: true },
    )
    if (props.sentByCurrentUser) {
      items.push({
        value: 'revoke',
        label: t('channels.message.revoke'),
        icon: 'i-mdi-undo-variant',
      })
    }
  }
  items.push({
    value: 'delete',
    label: t('channels.message.delete'),
    icon: 'i-mdi-delete-outline',
    danger: true,
  })
  return items
})

function toggleAgentMenu(): void {
  activeMenu.value = activeMenu.value === 'agent' ? null : 'agent'
}

function toggleMoreMenu(): void {
  if (activeMenu.value === 'more') {
    moreMenu.value?.hide()
    return
  }
  activeMenu.value = 'more'
  void nextTick(() => {
    const target = moreMenuAnchor.value
    if (target) moreMenu.value?.show({ currentTarget: target, target } as unknown as Event)
  })
}

function forwardToAgent(action: 'current' | 'conversation' | 'runtime' | 'all', id?: string): void {
  emit('forwardToAgent', action, id)
  activeMenu.value = null
}

function closeAgentMenu(): void {
  if (activeMenu.value === 'agent') activeMenu.value = null
  void nextTick(() => agentMenuAnchor.value?.querySelector('button')?.focus())
}

function closeMoreMenu(): void {
  if (activeMenu.value === 'more') activeMenu.value = null
  void nextTick(() => moreMenuAnchor.value?.querySelector('button')?.focus())
}

function selectMessageAction(value: string): void {
  if (
    value === 'reply' ||
    value === 'forward' ||
    value === 'reaction' ||
    value === 'revoke' ||
    value === 'delete'
  ) {
    emit('action', value)
  }
  moreMenu.value?.hide()
}
</script>

<template>
  <div
    class="channel-message-actions relative z-20 flex shrink-0 items-center rounded-control border border-line bg-canvas p-0.5 text-subtle"
    :class="{ 'channel-message-actions--open': activeMenu !== null }"
    role="toolbar"
    :aria-label="t('channels.message.actions')"
  >
    <TeaIconButton
      v-if="messageState === 'active'"
      class="channel-message-actions__button channel-message-actions__quick"
      size="small"
      :label="t('channels.message.reply')"
      icon="i-mdi-reply-outline"
      @click.stop="emit('action', 'reply')"
    />
    <TeaIconButton
      v-if="messageState === 'active'"
      class="channel-message-actions__button channel-message-actions__quick"
      size="small"
      :label="t('channels.message.forward')"
      icon="i-mdi-forward"
      @click.stop="emit('action', 'forward')"
    />
    <TeaIconButton
      v-if="messageState === 'active'"
      class="channel-message-actions__button channel-message-actions__quick"
      size="small"
      :label="t('channels.message.quickReaction')"
      icon="i-mdi-emoticon-plus-outline"
      @click.stop="emit('action', 'reaction')"
    />
    <span v-if="messageState === 'active'" ref="agentMenuAnchor" class="inline-flex">
      <TeaIconButton
        class="channel-message-actions__button"
        size="small"
        :label="t('channels.task.openMenu')"
        icon="i-mdi-creation-outline"
        :aria-expanded="activeMenu === 'agent'"
        aria-haspopup="menu"
        @pointerdown.stop
        @click.stop="toggleAgentMenu"
      />
    </span>
    <ChannelAgentMenu
      v-if="activeMenu === 'agent'"
      :anchor="agentMenuAnchor"
      :placement="openUp ? 'up' : 'down'"
      :active-conversation="activeConversation"
      :recent-conversations="recentConversations"
      :current-session-available="currentSessionAvailable"
      :runtimes="runtimes"
      :default-runtime-id="defaultRuntimeId"
      @add-to-current="forwardToAgent('current')"
      @select-conversation="forwardToAgent('conversation', $event)"
      @create-runtime="forwardToAgent('runtime', $event)"
      @view-all="forwardToAgent('all')"
      @close="closeAgentMenu"
    />
    <span ref="moreMenuAnchor" class="inline-flex">
      <TeaIconButton
        class="channel-message-actions__button"
        size="small"
        :label="t('channels.message.moreActions')"
        icon="i-mdi-dots-horizontal"
        :aria-expanded="activeMenu === 'more'"
        aria-haspopup="menu"
        @pointerdown.stop
        @click.stop="toggleMoreMenu"
      />
    </span>
    <TeaMenu
      v-if="activeMenu === 'more'"
      ref="moreMenu"
      popup
      :items="moreMenuItems"
      :placement="openUp ? 'up' : 'down'"
      :label="t('channels.message.moreActions')"
      @select="selectMessageAction"
      @hide="closeMoreMenu"
    />
  </div>
</template>

<style scoped>
.channel-message-actions {
  min-height: 2rem;
  transition: opacity 120ms ease;
}

.channel-message-actions__button {
  border-radius: var(--tea-radius-inline);
}

@media (hover: hover) and (pointer: fine) {
  .channel-message-actions {
    min-height: 1.875rem;
  }

  .channel-message-actions__button {
    width: 1.625rem;
    height: 1.625rem;
  }

  .channel-message-actions:not(.channel-message-actions--open) {
    pointer-events: none;
    opacity: 0;
  }

  .channel-message-actions:focus-within {
    pointer-events: auto;
    opacity: 1;
  }
}

@media (max-width: 639px), (hover: none), (pointer: coarse) {
  .channel-message-actions__quick {
    display: none;
  }
}
</style>
