<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaIconButton, TeaInput, TeaMenu, type TeaMenuItem } from '@/shared/ui'

import type {
  Channel,
  ChannelDraft,
  ChannelPresence,
  ChannelPresenceAvailability,
  ChannelRef,
  ChannelStatus,
} from '../contracts'
import ChannelAvatar from './ChannelAvatar.vue'
import ChannelPresenceIndicator from './ChannelPresenceIndicator.vue'

const props = withDefaults(
  defineProps<{
    channels: Channel[]
    activeRef: ChannelRef | null
    status: ChannelStatus
    loading: boolean
    pendingRefs?: ChannelRef[]
    drafts?: ChannelDraft[]
    presences?: ChannelPresence[]
  }>(),
  { pendingRefs: () => [], drafts: () => [], presences: () => [] },
)

const emit = defineEmits<{
  select: [channelRef: ChannelRef]
  openSearch: []
  openSaved: []
  pin: [channelRef: ChannelRef, pinned: boolean]
  mute: [channelRef: ChannelRef, muted: boolean]
  markRead: [channelRef: ChannelRef]
  hide: [channelRef: ChannelRef]
}>()
const { t } = useI18n()
const query = ref('')
const filteredChannels = computed(() => {
  const value = query.value.trim().toLocaleLowerCase()
  if (!value) return props.channels
  return props.channels.filter((channel) =>
    `${channel.name} ${channel.description}`.toLocaleLowerCase().includes(value),
  )
})
const pendingRefs = computed(() => new Set(props.pendingRefs))
const presencesByAccount = computed(
  () => new Map(props.presences.map((presence) => [presence.accountId, presence] as const)),
)
const draftsByChannel = computed(
  () =>
    new Map(
      props.drafts
        .filter((draft) => draft.text.trim())
        .map((draft) => [draft.channelRef, draft] as const),
    ),
)
const contextMenu = ref<InstanceType<typeof TeaMenu> | null>(null)
const contextChannelRef = ref<ChannelRef | null>(null)
const contextChannel = computed(
  () => props.channels.find((channel) => channel.ref === contextChannelRef.value) ?? null,
)
const contextMenuItems = computed(() =>
  contextChannel.value ? conversationMenuItems(contextChannel.value) : [],
)

function conversationMenuItems(channel: Channel): TeaMenuItem[] {
  const disabled = pendingRefs.value.has(channel.ref)
  const items: TeaMenuItem[] = [
    {
      value: 'pin',
      label: t(channel.pinned ? 'channels.controls.unpin' : 'channels.controls.pin'),
      icon: channel.pinned ? 'i-mdi-pin-off-outline' : 'i-mdi-pin-outline',
      disabled,
    },
    {
      value: 'mute',
      label: t(channel.muted ? 'channels.controls.unmute' : 'channels.controls.mute'),
      icon: channel.muted ? 'i-mdi-bell-outline' : 'i-mdi-bell-off-outline',
      disabled,
    },
  ]
  if (channel.unreadCount > 0)
    items.push({
      value: 'markRead',
      label: t('channels.controls.markRead'),
      icon: 'i-mdi-email-open-outline',
      disabled,
    })
  items.push(
    { value: 'separator', label: '', separator: true },
    {
      value: 'hide',
      label: t('channels.controls.hide'),
      icon: 'i-mdi-eye-off-outline',
      disabled,
    },
  )
  return items
}

function selectConversationAction(channel: Channel, action: string): void {
  if (action === 'pin') emit('pin', channel.ref, !channel.pinned)
  else if (action === 'mute') emit('mute', channel.ref, !channel.muted)
  else if (action === 'markRead') emit('markRead', channel.ref)
  else if (action === 'hide') emit('hide', channel.ref)
}

function openConversationMenu(
  channel: Channel,
  point: Pick<MouseEvent, 'clientX' | 'clientY'>,
): void {
  if (pendingRefs.value.has(channel.ref)) return
  contextChannelRef.value = channel.ref
  void nextTick(() => contextMenu.value?.showAt({ x: point.clientX, y: point.clientY }))
}

function handleRowKeydown(event: KeyboardEvent, channel: Channel): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  event.preventDefault()
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const rect = target.getBoundingClientRect()
  openConversationMenu(channel, {
    clientX: rect.left + Math.min(24, rect.width / 2),
    clientY: rect.top + Math.min(24, rect.height / 2),
  })
}

function closeConversationMenu(): void {
  contextChannelRef.value = null
}

function selectContextAction(action: string): void {
  const channel = contextChannel.value
  if (!channel) return
  selectConversationAction(channel, action)
}

function channelStatusLabel(channel: Channel): string {
  return [
    channel.pinned ? t('channels.controls.pinned') : '',
    channel.muted ? t('channels.controls.muted') : '',
  ]
    .filter(Boolean)
    .join(', ')
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value)
}

function presenceAvailability(channel: Channel): ChannelPresenceAvailability {
  return channel.directAccountId
    ? (presencesByAccount.value.get(channel.directAccountId)?.availability ?? 'unknown')
    : 'unknown'
}
</script>

<template>
  <aside
    class="hidden h-full w-[288px] shrink-0 flex-col border-r border-line-soft bg-panel sm:flex"
  >
    <div class="px-2 pb-1.5 pt-3">
      <div class="flex h-7 items-center gap-2">
        <h1 class="truncate text-lg font-semibold text-fg">{{ t('channels.title') }}</h1>
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="
            loading && channels.length === 0
              ? 'animate-pulse bg-muted motion-reduce:animate-none'
              : status.phase === 'connected'
                ? 'bg-success'
                : status.phase === 'failed' || status.phase === 'kickedOffline'
                  ? 'bg-danger'
                  : 'bg-muted'
          "
          :title="
            loading && channels.length === 0
              ? t('channels.loading')
              : t(`channels.connection.${status.phase}`)
          "
        />
        <TeaIconButton
          class="ml-auto"
          size="small"
          :label="t('channels.saved.open')"
          icon="i-mdi-bookmark-outline"
          :disabled="loading && channels.length === 0"
          @click="emit('openSaved')"
        />
        <TeaIconButton
          size="small"
          :label="t('channels.searchAllMessages')"
          icon="i-mdi-magnify"
          :disabled="loading && channels.length === 0"
          @click="emit('openSearch')"
        />
      </div>
      <TeaInput
        v-model="query"
        class="mt-2"
        type="search"
        size="small"
        :label="t('channels.search')"
        :placeholder="t('channels.search')"
        :disabled="loading && channels.length === 0"
      />
    </div>

    <div
      class="channel-list-scroll-area flex-1 overflow-y-auto border-t border-line-soft bg-canvas px-2 pb-2 pt-3"
    >
      <div
        v-if="loading && channels.length === 0"
        class="pt-0.5"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="sr-only">{{ t('channels.loading') }}</span>
        <div aria-hidden="true">
          <div
            v-for="index in 6"
            :key="index"
            class="channel-row channel-row--skeleton mb-1 min-h-12 w-full animate-pulse items-center gap-2 px-3.5 py-1.5 motion-reduce:animate-none"
            :style="{ animationDelay: `${(index - 1) * 80}ms` }"
          >
            <span class="size-8 shrink-0 rounded-full bg-muted" />
            <span class="min-w-0 space-y-2">
              <span
                class="block h-2.5 rounded-full bg-muted"
                :class="index % 3 === 0 ? 'w-20' : index % 2 === 0 ? 'w-28' : 'w-24'"
              />
              <span
                class="block h-2 rounded-full bg-panel"
                :class="index % 2 === 0 ? 'w-32' : 'w-36'"
              />
            </span>
            <span class="h-2 w-9 justify-self-end rounded-full bg-panel" />
          </div>
        </div>
      </div>
      <template v-else>
        <div
          v-for="(channel, index) in filteredChannels"
          :key="channel.ref"
          class="channel-row group mb-1 min-h-12 w-full animate-fade-slide items-center gap-2 overflow-hidden px-3.5 py-1.5 text-left"
          :class="channel.ref === activeRef ? 'channel-row--active' : 'hover:bg-hover'"
          :aria-current="channel.ref === activeRef ? 'page' : undefined"
          :style="{ animationDelay: `${index * 35}ms` }"
          @contextmenu.prevent.stop="openConversationMenu(channel, $event)"
          @keydown="handleRowKeydown($event, channel)"
        >
          <TeaButton
            appearance="ghost"
            size="small"
            class="channel-row__select min-w-0 justify-start gap-2 overflow-hidden text-left"
            :aria-pressed="channel.ref === activeRef"
            @click="emit('select', channel.ref)"
          >
            <span
              v-if="channel.unreadCount"
              class="channel-row__unread-rail"
              role="img"
              :aria-label="t('channels.unread')"
              :title="t('channels.unread')"
            />
            <span class="relative size-8 shrink-0">
              <ChannelAvatar
                :channel-ref="channel.ref"
                :name="channel.name"
                :avatar-url="channel.avatarUrl"
              />
              <ChannelPresenceIndicator
                v-if="channel.kind === 'direct' && channel.directAccountId"
                class="absolute bottom-0 right-0"
                :availability="presenceAvailability(channel)"
                size="avatar"
              />
            </span>
            <span class="channel-row__details min-w-0">
              <span class="channel-row__name flex min-w-0 items-center gap-1 text-sm leading-5">
                <span
                  class="min-w-0 truncate text-fg"
                  :class="channel.unreadCount ? 'font-semibold' : 'font-medium'"
                  >{{ channel.name }}</span
                >
                <span
                  v-if="channel.pinned || channel.muted"
                  class="channel-row__status inline-flex shrink-0 items-center gap-0.5 text-subtle"
                  role="img"
                  :aria-label="channelStatusLabel(channel)"
                >
                  <span
                    v-if="channel.pinned"
                    data-channel-status="pinned"
                    class="i-mdi-pin-outline size-3.5"
                    aria-hidden="true"
                  />
                  <span
                    v-if="channel.muted"
                    data-channel-status="muted"
                    class="i-mdi-bell-off-outline size-3.5"
                    aria-hidden="true"
                  />
                </span>
              </span>
              <span
                class="channel-row__preview mt-0.5 flex min-w-0 items-center gap-1 text-xs leading-4"
              >
                <span
                  v-if="draftsByChannel.has(channel.ref)"
                  class="shrink-0 font-semibold text-danger"
                  >{{ t('channels.drafts.label') }}</span
                >
                <span class="truncate" :class="channel.unreadCount ? 'text-dim' : 'text-subtle'">{{
                  draftsByChannel.get(channel.ref)?.text.trim() ||
                  channel.lastMessagePreview ||
                  channel.description
                }}</span>
              </span>
            </span>
            <span class="grid h-full min-w-0 content-center justify-items-end gap-1">
              <span class="whitespace-nowrap text-xs tabular-nums text-subtle">{{
                formatTime(channel.updatedAt)
              }}</span>
              <span v-if="channel.unreadCount" class="channel-row__unread-dot" aria-hidden="true" />
            </span>
          </TeaButton>
        </div>

        <p
          v-if="!loading && filteredChannels.length === 0"
          class="px-3 py-6 text-center text-sm text-subtle"
        >
          {{ t('channels.noResults') }}
        </p>
      </template>
    </div>
    <TeaMenu
      v-if="contextChannel"
      ref="contextMenu"
      popup
      :items="contextMenuItems"
      :label="t('channels.controls.actions', { name: contextChannel.name })"
      :menu-label="contextChannel.name"
      @select="selectContextAction"
      @hide="closeConversationMenu"
    />
  </aside>
</template>

<style scoped>
.channel-row {
  position: relative;
  display: grid;
  block-size: 3.25rem;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 3.25rem;
  border-radius: var(--tea-radius-inline);
  padding: 0;
}

.channel-row--skeleton {
  grid-template-columns: 2rem minmax(0, 1fr) 3.75rem;
  padding: 0.375rem 0.875rem;
}

.channel-row__select {
  display: grid;
  height: 100%;
  grid-template-columns: 2rem minmax(0, 1fr) 3.75rem;
  border-color: transparent;
  border-radius: var(--tea-radius-inline);
  background: transparent;
  padding: 0.375rem 0.875rem;
}

.channel-row__select:hover,
.channel-row__select:active,
.channel-row__select:focus-visible {
  border-color: transparent;
  background: transparent;
}

.channel-row__unread-rail {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 0;
  block-size: 0.625rem;
  inline-size: 0.1875rem;
  transform: translateY(-50%);
  border-radius: 0 var(--tea-radius-pill) var(--tea-radius-pill) 0;
  background: var(--tea-inverse);
}

.channel-row__unread-dot {
  block-size: 0.375rem;
  inline-size: 0.375rem;
  border-radius: var(--tea-radius-pill);
  background: var(--tea-inverse);
}

.channel-row__details {
  display: flex;
  min-block-size: 2.375rem;
  flex-direction: column;
  justify-content: center;
}

.channel-row__preview {
  min-block-size: 1rem;
}

.channel-row--active {
  background: var(--tea-muted);
  color: var(--tea-fg);
}

.channel-row__status {
  line-height: 1;
}
</style>
