<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaIconMenu, type TeaMenuItem } from '@/shared/ui'
import RuntimeIcon from '../../../shared/ui/RuntimeIcon.vue'
import ConversationActivityIndicator from './ConversationActivityIndicator.vue'
import type { ConversationSummary } from '../contracts'

const props = withDefaults(
  defineProps<{
    conversation: ConversationSummary
    runtimeLabel: string
    active: boolean
    running?: boolean
    completed?: boolean
    project?: boolean
    animationDelay?: string
    disabled?: boolean
  }>(),
  {
    running: false,
    completed: false,
    project: false,
    animationDelay: '0ms',
    disabled: false,
  },
)

const emit = defineEmits<{
  select: [id: string]
  archive: [id: string]
  delete: [id: string]
}>()
const { t } = useI18n()

const title = computed(
  () => props.conversation.title || props.conversation.lastMessagePreview || t('sidebar.untitled'),
)
const menuItems = computed<TeaMenuItem[]>(() => [
  {
    value: 'archive',
    label: t('sidebar.archiveConversation'),
    icon: 'i-mdi-archive-outline',
  },
  { value: 'separator', label: '', separator: true },
  {
    value: 'delete',
    label: t('sidebar.deleteConversation'),
    icon: 'i-mdi-delete-outline',
  },
])

function selectAction(value: string): void {
  if (value === 'archive') emit('archive', props.conversation.conversationId)
  if (value === 'delete') emit('delete', props.conversation.conversationId)
}
</script>

<template>
  <div
    class="conversation-row group flex min-h-9 w-full animate-fade-slide items-center gap-1 rounded-control text-left"
    :class="[
      project ? 'conversation-row--project' : 'conversation-row--recent',
      active ? 'conversation-row--active' : 'hover:bg-hover',
    ]"
    :aria-current="active ? 'page' : undefined"
    :style="{ animationDelay }"
  >
    <TeaButton
      appearance="ghost"
      class="conversation-row__select min-w-0 flex-1 justify-start gap-2 text-left"
      :class="project ? 'text-[0.8125rem]' : 'text-sm'"
      :aria-label="title"
      :aria-current="active ? 'page' : undefined"
      :title="title"
      :disabled="disabled"
      @click="emit('select', conversation.conversationId)"
    >
      <span class="conversation-row__title min-w-0 flex-1 truncate font-normal leading-5 text-dim">
        {{ title }}
      </span>
      <span
        class="conversation-row__context"
        :class="{ 'conversation-row__context--channel': conversation.channelBinding }"
      >
        <RuntimeIcon
          size="small"
          class="conversation-row__runtime text-subtle"
          :runtime-id="conversation.runtimeId"
          :label="runtimeLabel"
        />
        <span
          v-if="conversation.channelBinding"
          class="conversation-row__channel i-mdi-pound size-3 shrink-0 text-subtle"
          aria-hidden="true"
        />
      </span>
      <ConversationActivityIndicator :running="running" :completed="completed" />
    </TeaButton>
    <TeaIconMenu
      size="small"
      :items="menuItems"
      :label="t('sidebar.conversationActions')"
      :menu-label="title"
      :disabled="disabled"
      class="conversation-row__menu shrink-0 opacity-0 transition-opacity motion-reduce:transition-none"
      @select="selectAction"
    />
  </div>
</template>

<style scoped>
.conversation-row {
  width: calc(100% - 1rem);
  min-height: 2.25rem;
  margin-inline: 0.5rem;
  padding-inline: 1rem;
  border-radius: var(--tea-radius-control);
  transition: background-color 150ms ease;
}

.conversation-row--project,
.conversation-row--recent {
  padding-left: 1.75rem;
  padding-right: 1rem;
}

.conversation-row--active,
.conversation-row--active:hover {
  background: var(--tea-muted);
}

.conversation-row:not(.conversation-row--active):hover {
  background: var(--tea-hover);
}

.conversation-row:has(.conversation-row__select:focus-visible) {
  outline: 2px solid var(--tea-focus);
  outline-offset: -2px;
}

.conversation-row__select {
  min-width: 0;
  border-color: transparent;
  background: transparent;
  outline: none;
  padding-inline: 0;
}

.conversation-row__select:hover,
.conversation-row__select:active,
.conversation-row__select:focus-visible {
  border-color: transparent;
  background: transparent;
}

.conversation-row__context {
  display: none;
  width: 1rem;
  height: 1rem;
  flex: 0 0 1rem;
  align-items: center;
  justify-content: center;
}

.conversation-row__context--channel {
  display: inline-flex;
}

.conversation-row__runtime {
  display: none;
}

.conversation-row:hover .conversation-row__context,
.conversation-row:has(:focus-visible) .conversation-row__context {
  display: inline-flex;
}

.conversation-row:hover .conversation-row__runtime,
.conversation-row:has(:focus-visible) .conversation-row__runtime {
  display: inline-flex;
}

.conversation-row:hover .conversation-row__channel,
.conversation-row:has(:focus-visible) .conversation-row__channel {
  display: none;
}

.conversation-row:hover .conversation-row__menu,
.conversation-row:has(:focus-visible) .conversation-row__menu {
  opacity: 1;
}

.conversation-row--active .conversation-row__title {
  color: var(--tea-fg);
}

@media (prefers-reduced-motion: reduce) {
  .conversation-row {
    transition: none;
  }
}
</style>
