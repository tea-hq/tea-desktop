<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import { TeaIconButton } from '@/shared/ui'
import ChannelAgentMenu from './ChannelAgentMenu.vue'

defineProps<{
  openUp: boolean
  activeConversation: ConversationSummary | null
  recentConversations: ConversationSummary[]
  currentSessionAvailable: boolean
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId: string | null
}>()

const emit = defineEmits<{
  forwardToAgent: [action: 'current' | 'conversation' | 'runtime' | 'all', id?: string]
}>()
const { t } = useI18n()
const menuOpen = ref(false)
const menuAnchor = ref<HTMLElement | null>(null)

function toggleAgentMenu(): void {
  menuOpen.value = !menuOpen.value
}

function forwardToAgent(action: 'current' | 'conversation' | 'runtime' | 'all', id?: string): void {
  emit('forwardToAgent', action, id)
  menuOpen.value = false
}

function closeAgentMenu(): void {
  menuOpen.value = false
  void nextTick(() => menuAnchor.value?.querySelector('button')?.focus())
}
</script>

<template>
  <div
    class="channel-message-actions relative z-20 flex shrink-0 items-center rounded-control border border-line bg-canvas p-0.5 text-subtle"
    :class="{ 'channel-message-actions--open': menuOpen }"
    role="toolbar"
    :aria-label="t('channels.message.actions')"
  >
    <span ref="menuAnchor" class="inline-flex">
      <TeaIconButton
        class="channel-message-actions__button"
        size="small"
        :label="t('channels.task.openMenu')"
        icon="i-mdi-creation-outline"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click.stop="toggleAgentMenu"
      />
    </span>
    <ChannelAgentMenu
      v-if="menuOpen"
      :anchor="menuAnchor"
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
</style>
