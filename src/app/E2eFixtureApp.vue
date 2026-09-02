<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { fullAgentProfile } from '@/app/composerProfiles'
import WorkspaceRail from '@/app/components/WorkspaceRail.vue'
import WindowChrome from '@/app/components/WindowChrome.vue'
import WorkspaceSearchField from '@/app/components/WorkspaceSearchField.vue'
import ChannelConnectionPanel from '@/features/channels/components/ChannelConnectionPanel.vue'
import ChannelForwardDialog from '@/features/channels/components/ChannelForwardDialog.vue'
import ChannelMergedMessagesDialog from '@/features/channels/components/ChannelMergedMessagesDialog.vue'
import ChannelReceiptDetailsDialog from '@/features/channels/components/ChannelReceiptDetailsDialog.vue'
import ChannelPinnedMessagesDialog from '@/features/channels/components/ChannelPinnedMessagesDialog.vue'
import ChannelSavedMessagesDialog from '@/features/channels/components/ChannelSavedMessagesDialog.vue'
import ChannelSidebar from '@/features/channels/components/ChannelSidebar.vue'
import ChannelTimeline from '@/features/channels/components/ChannelTimeline.vue'
import type {
  Channel,
  ChannelDraft,
  ChannelMember,
  ForwardMessageMode,
  Message,
  MessageReceiptDetails,
  PinnedMessage,
  SavedMessage,
} from '@/features/channels/contracts'
import { createTextMessageContent } from '@/features/channels/messageContent'
import { messageSelectionKey } from '@/features/channels/useChannelMessageSelection'
import AgentDrawer from '@/features/collaboration/components/AgentDrawer.vue'
import DraftEditorDialog from '@/features/collaboration/components/DraftEditorDialog.vue'
import type { AgentDrawerChannelState } from '@/features/collaboration/agentDrawerContracts'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import ConversationSidebar from '@/features/conversation/components/ConversationSidebar.vue'
import DirectoryPage from '@/features/directory/components/DirectoryPage.vue'
import TaskWorkspace from '@/features/tasks/components/TaskWorkspace.vue'
import type { DirectoryUser } from '@/features/directory/contracts'
import type {
  ComposerAttachment,
  ConversationSummary,
  ConversationTurn,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '@/features/conversation/contracts'
import type { Delivery, Draft } from '@/types/channelCollaboration'

const params = new URLSearchParams(window.location.search)
const fixture = ref(params.get('fixture') ?? 'drawer-empty')
const globalSearchQuery = ref('')
const multipleRoles = params.get('roles') === 'multiple'
const channelLoading = computed(() => fixture.value === 'channel-loading')
const { locale, t } = useI18n()
locale.value = params.get('lang') === 'zh-CN' ? 'zh-CN' : 'en'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt', 'history', 'approval', 'cancel'],
  status: 'ready',
}
const alternateRuntime: RuntimeDescriptor = {
  ...runtime,
  id: 'external.codex',
  displayName: 'Codex',
}
const availableRuntimes = [runtime, alternateRuntime]
const fixtureModelOptions: ModelOption[] = [
  { value: 'gpt-5.6-sol', label: '5.6 Sol', source: 'runtime' },
  { value: 'gpt-5.6-terra', label: '5.6 Terra', source: 'runtime' },
  { value: 'gpt-5.6-luna', label: '5.6 Luna', source: 'runtime' },
  { value: 'gpt-5.5', label: '5.5', source: 'runtime' },
  { value: 'gpt-5.2', label: '5.2', source: 'runtime' },
]
const binding = { transportId: 'fixture.im', accountRef: 'e2e-account', channelRef: 'product' }
const fixtureUserProfiles = new Map([
  ['fixture-account', { accountId: 'fixture-account', name: 'Jing Deng' }],
])
const channel: Channel = {
  ref: binding.channelRef,
  kind: 'group',
  name: 'Product design',
  description: 'Desktop Agent experience',
  memberCount: 18,
  pinned: true,
  muted: false,
  unreadCount: 3,
  updatedAt: 1_787_843_600_000,
  lastMessagePreview: 'The drawer direction is approved.',
}
const channels: Channel[] = [
  channel,
  {
    ref: 'engineering',
    kind: 'group',
    name: 'Engineering',
    description: 'Implementation coordination',
    memberCount: 24,
    pinned: false,
    muted: true,
    unreadCount: 0,
    updatedAt: 1_787_843_000_000,
    lastMessagePreview: 'Type checks are green.',
  },
]
const imDraftText = ref(fixture.value === 'im-draft' ? '@Lin review the release notes' : '')
const imDrafts = computed<ChannelDraft[]>(() =>
  imDraftText.value.trim()
    ? [
        {
          accountRef: binding.accountRef,
          channelRef: channel.ref,
          text: imDraftText.value,
          mentions: [],
          updatedAt: 1_787_843_700_000,
        },
      ]
    : [],
)
const messages: Message[] = [
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-1', messageServerId: 'server-1' },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
    sentAt: 1_787_843_000_000,
    text: 'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
    content: createTextMessageContent(
      'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
    ),
    state: 'active',
    sentByCurrentUser: false,
    pinned: false,
    reactions: [{ type: 1, count: 3, active: false }],
  },
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-2', messageServerId: 'server-2' },
    sender: { id: 'current', name: 'Jing', isCurrentUser: true },
    sentAt: 1_787_843_300_000,
    text: 'Yes. The same conversation surface will be reused in drawer and full workspace modes.',
    content: createTextMessageContent(
      'Yes. The same conversation surface will be reused in drawer and full workspace modes.',
    ),
    state: 'active',
    sentByCurrentUser: true,
    pinned: false,
    reactions: [],
    receipt: { readCount: 12, unreadCount: 5 },
  },
]
const mentionMembers: ChannelMember[] = [
  { accountId: 'lin', name: 'Lin', role: 'member', chatBanned: false },
  { accountId: 'kai', name: 'Kai', role: 'manager', chatBanned: false },
  { accountId: 'maya', name: 'Maya Chen', role: 'member', chatBanned: false },
]
const receiptDetailsOpen = ref(fixture.value === 'receipt-details')
const receiptDetails: MessageReceiptDetails = {
  messageRef: messages[1]!.ref,
  read: [
    { id: 'lin', name: 'Lin', isCurrentUser: false },
    { id: 'kai', name: 'Kai', isCurrentUser: false },
  ],
  unread: [{ id: 'maya', name: 'Maya Chen', isCurrentUser: false }],
  readCount: 12,
  unreadCount: 5,
}
const mergedMessage: Message = {
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-merged',
    messageServerId: 'server-merged',
  },
  sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
  sentAt: 1_787_843_500_000,
  text: 'Product design chat history',
  content: {
    kind: 'merged',
    sourceChannelName: 'Product design',
    abstracts: [
      {
        senderAccountId: 'designer',
        senderName: 'Lin',
        text: 'Keep the Channel timeline focused on collaboration.',
      },
      {
        senderAccountId: 'current',
        senderName: 'Jing',
        text: 'The Agent drawer can preserve the complete work context.',
      },
    ],
    depth: 1,
  },
  state: 'active',
  sentByCurrentUser: false,
  pinned: false,
  reactions: [],
}
const nestedMergedMessage: Message = {
  ...mergedMessage,
  ref: {
    channelRef: channel.ref,
    messageClientId: 'message-merged-nested',
    messageServerId: 'server-merged-nested',
  },
  sender: { id: 'engineer', name: 'Kai', isCurrentUser: false },
  text: 'Engineering chat history',
  content: {
    kind: 'merged',
    sourceChannelName: 'Engineering',
    abstracts: [
      {
        senderAccountId: 'engineer',
        senderName: 'Kai',
        text: 'The provider-neutral boundary is ready for review.',
      },
    ],
    depth: 2,
  },
}
const archivedMessages: Message[] = [messages[0]!, messages[1]!, nestedMergedMessage]
const timelineMessages = computed(() =>
  fixture.value === 'merged-card' ? [...messages, mergedMessage] : messages,
)
const selectingMessages = ref(fixture.value === 'message-selection')
const selectedMessageKeys = computed(() =>
  selectingMessages.value ? messages.map(messageSelectionKey) : [],
)
const forwardingMessages = ref<Message[]>(
  fixture.value === 'message-forwarding' ? [...messages] : [],
)
const forwardingMode = ref<ForwardMessageMode>('merged')
const mergedViewerMessage = ref<Message | null>(
  fixture.value.startsWith('merged-') && fixture.value !== 'merged-card' ? mergedMessage : null,
)
const mergedViewerItems = ref<Message[]>(fixture.value === 'merged-viewer' ? archivedMessages : [])
const mergedViewerLoading = ref(fixture.value === 'merged-loading')
const mergedViewerErrorCode = ref<string | null>(
  fixture.value === 'merged-error' ? 'archive_checksum_mismatch' : null,
)
const mergedViewerCanGoBack = ref(false)
const pinnedMessages: PinnedMessage[] = messages.map((message, index) => ({
  message: { ...message, pinned: true },
  pinnedByAccountId: index === 0 ? 'designer' : 'current',
  pinnedAt: message.sentAt + 60_000,
}))
const savedMessages: SavedMessage[] = messages.map((message, index) => ({
  id: `saved-${index + 1}`,
  message,
  sourceChannelName: channel.name,
  savedAt: message.sentAt + 120_000,
}))
const activeTurn: ConversationTurn = {
  id: 'turn-1',
  user: { id: 'prompt-1', text: 'Review the Agent drawer proposal.', attachments: [] },
  blocks: [
    {
      kind: 'assistantText',
      id: 'block-1',
      sequence: 1,
      text: 'The drawer reduces persistent chrome while preserving model, permission, Role, attachment, source, and approval controls.',
      streaming: false,
    },
  ],
  status: 'completed',
  lastEventSequence: 2,
}
const approvalTurn: ConversationTurn = {
  id: 'turn-2',
  user: { id: 'prompt-2', text: 'Apply the approved visual changes.', attachments: [] },
  blocks: [
    {
      kind: 'toolCall',
      id: 'tool-1',
      sequence: 1,
      name: 'workspace.edit',
      status: 'approvalRequired',
      approval: {
        id: 'approval-1',
        toolCallId: 'tool-1',
        toolName: 'workspace.edit',
        capabilities: ['write'],
        resources: ['src/App.vue'],
        decisions: ['allowOnce', 'deny'],
        status: 'pending',
      },
    },
  ],
  status: 'running',
  lastEventSequence: 1,
}
const conversations = ref<ConversationSummary[]>(
  Array.from({ length: 10 }, (_, index) => ({
    conversationId: `conversation-${index}`,
    runtimeId: runtime.id,
    workspaceId: 'e2e',
    title: index === 0 ? 'Agent drawer architecture' : `Product session ${index + 1}`,
    lastMessagePreview: 'Reviewing interaction details and implementation state.',
    createdAt: 1_787_840_000_000 + index,
    updatedAt: 1_787_843_000_000 + index,
    channelBinding: binding,
  })),
)
const initialPhase =
  fixture.value === 'drawer-empty' || fixture.value === 'drawer-recent'
    ? 'index'
    : fixture.value === 'drawer-preparing'
      ? 'preparing'
      : 'active'
const drawerState = reactive<AgentDrawerChannelState>({
  binding,
  phase: initialPhase,
  listMode: 'recent',
  query: '',
  scrollOffset: 0,
  selectedConversationId: initialPhase === 'active' ? conversations.value[0]!.conversationId : null,
  draft: {
    runtimeId: runtime.id,
    model: fixtureModelOptions[0]!.value,
    permissionMode: 'default',
    roleId: null,
    text: initialPhase === 'preparing' ? 'Create a concise implementation plan' : '',
    attachments: [],
    sources: [],
    creationIdempotencyKey: 'e2e:first-send',
    conversationId: initialPhase === 'active' ? conversations.value[0]!.conversationId : null,
  },
})
const drawerOpen = ref(fixture.value.startsWith('drawer'))
const turns = ref<ConversationTurn[]>(
  fixture.value === 'drawer-active' ||
    fixture.value === 'draft-dialog' ||
    fixture.value === 'full-agent'
    ? [activeTurn, approvalTurn]
    : [],
)
const fullText = ref('')
const fullAttachments = ref<ComposerAttachment[]>([])
const fullRuntimeId = ref(runtime.id)
const fullModel = ref(fixtureModelOptions[0]!.value)
const fullPermissionMode = ref<PermissionMode>('default')
const fullRoleId = ref<string | null>(null)
const roleOptions = [
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Keep changes focused and verify the result.',
    prompt: 'Review the task for correctness, scope, and test coverage.',
    skills: ['code-review', 'testing', 'accessibility'],
    revision: 2,
    runtimeId: runtime.id,
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Turn ambiguous requests into clear implementation steps.',
    prompt: 'Build a concise implementation plan with risks and checkpoints.',
    skills: ['planning', 'architecture'],
    revision: 1,
    runtimeId: runtime.id,
  },
  {
    id: 'builder',
    name: 'Builder',
    description: 'Make focused changes and verify them with the right checks.',
    prompt: 'Implement the requested change and run the relevant checks.',
    skills: ['typescript', 'testing'],
    revision: 1,
    runtimeId: runtime.id,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Map unfamiliar code and surface the important dependencies.',
    prompt: 'Explore the codebase and summarize the relevant ownership boundaries.',
    skills: ['code-search', 'architecture'],
    revision: 1,
    runtimeId: runtime.id,
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Shape technical work into concise, readable documentation.',
    prompt: 'Draft clear documentation that captures decisions and next steps.',
    skills: ['documentation', 'editing'],
    revision: 1,
    runtimeId: runtime.id,
  },
]
const fixtureRoles = multipleRoles ? roleOptions : roleOptions.slice(0, 1)
const directoryUsers: DirectoryUser[] = [
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-lin', displayName: 'Lin Zhixu' },
    oidc: {
      subject: 'oidc-lin',
      preferredUsername: 'zhixu.lin',
      email: 'zhixu.lin@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'tea_zhixu', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-chen', displayName: 'Chen Wangshu' },
    oidc: {
      subject: 'oidc-chen',
      preferredUsername: 'wangshu.chen',
      email: 'wangshu.chen@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'tea_wangshu', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-zhou', displayName: 'Zhou Jianwei' },
    oidc: {
      subject: 'oidc-zhou',
      preferredUsername: 'zhou-jianwei-with-a-long-identity',
      email: 'jianwei.zhou@example.test',
      emailVerified: true,
    },
    im: { provider: 'Yunxin', account: 'tea_jianwei', status: 'ready' },
  },
  {
    tenant: { id: 'tenant-demo', domain: 'example.test', displayName: 'Tea Product Studio' },
    center: { userId: 'user-song', displayName: 'Song Yuan' },
    oidc: {
      subject: 'oidc-song',
      preferredUsername: 'song.yuan',
      emailVerified: false,
    },
    im: { provider: 'Yunxin', status: 'unavailable' },
  },
]
const directoryQuery = ref('')
const directoryMessageUser = ref<DirectoryUser | null>(null)
const filteredDirectoryUsers = computed(() => {
  const query = directoryQuery.value.trim().toLocaleLowerCase()
  if (!query) return directoryUsers
  return directoryUsers.filter((user) =>
    [
      user.center.displayName,
      user.center.userId,
      user.oidc.preferredUsername,
      user.oidc.email,
      user.im?.account,
    ].some((value) => value?.toLocaleLowerCase().includes(query)),
  )
})
const activeMode = ref<'channels' | 'agent' | 'directory' | 'tasks'>(
  fixture.value === 'tasks'
    ? 'tasks'
    : fixture.value.startsWith('directory')
      ? 'directory'
      : fixture.value === 'full-agent'
        ? 'agent'
        : 'channels',
)
const draftDialogOpen = ref(fixture.value === 'draft-dialog')
const draft = ref<Draft>({
  draftId: 'draft-1',
  conversationId: conversations.value[0]!.conversationId,
  sourceTurnIndex: 0,
  sourceBlockId: 'block-1',
  currentVersion: 1,
  content: 'Share the reviewed drawer implementation with the Channel.',
  createdAt: 1_787_843_400_000,
  updatedAt: 1_787_843_400_000,
})
const delivery = ref<Delivery | undefined>()
const visibleConversations = computed(() =>
  fixture.value === 'drawer-empty' && drawerState.phase === 'index' ? [] : conversations.value,
)

function createSession(): void {
  drawerState.phase = 'preparing'
  drawerState.selectedConversationId = null
}
function createSessionWithRuntime(runtimeId: string): void {
  drawerState.draft.runtimeId = runtimeId
  createSession()
}
function selectSession(id: string): void {
  drawerState.phase = 'active'
  drawerState.selectedConversationId = id
  drawerState.draft.conversationId = id
}
function send(payload: { text: string; attachments: ComposerAttachment[] }): void {
  if (drawerState.phase === 'preparing') {
    const summary: ConversationSummary = {
      conversationId: 'conversation-created',
      runtimeId: drawerState.draft.runtimeId ?? runtime.id,
      workspaceId: 'e2e',
      title: 'New Agent session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      channelBinding: binding,
    }
    conversations.value.unshift(summary)
    drawerState.phase = 'active'
    drawerState.selectedConversationId = summary.conversationId
    drawerState.draft.conversationId = summary.conversationId
  }
  turns.value.push({
    id: `turn-${turns.value.length + 1}`,
    user: { id: crypto.randomUUID(), text: payload.text, attachments: [] },
    blocks: [],
    status: 'running',
    lastEventSequence: 0,
  })
  drawerState.draft.text = ''
}
function createFullSessionWithRuntime(runtimeId: string): void {
  fullRuntimeId.value = runtimeId
  fullText.value = ''
  turns.value = []
  activeMode.value = 'agent'
}
function createFullSession(): void {
  createFullSessionWithRuntime(runtime.id)
}
function injectPrompt(current: string, prompt: string): string {
  const next = prompt.trim()
  if (!next) return current
  const existing = current.trim()
  return existing ? `${existing}\n\n${next}` : next
}
function saveDraft(content: string): void {
  draft.value = {
    ...draft.value,
    content,
    currentVersion: draft.value.currentVersion + 1,
    updatedAt: Date.now(),
  }
}
function deliverDraft(): void {
  delivery.value = {
    deliveryId: 'delivery-1',
    draftId: draft.value.draftId,
    draftVersion: draft.value.currentVersion,
    channelBinding: binding,
    idempotencyKey: 'e2e:delivery',
    status: 'sent',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
function openFixtureForwarding(mode: ForwardMessageMode): void {
  forwardingMode.value = mode
  forwardingMessages.value = [...messages]
}
function openFixtureMergedMessage(message: Message): void {
  if (message.content.kind !== 'merged') return
  const nested = message.ref.messageClientId === nestedMergedMessage.ref.messageClientId
  mergedViewerMessage.value = message
  mergedViewerItems.value = nested ? [] : archivedMessages
  mergedViewerLoading.value = false
  mergedViewerErrorCode.value = null
  mergedViewerCanGoBack.value = nested
}
function retryFixtureMergedMessages(): void {
  mergedViewerLoading.value = false
  mergedViewerErrorCode.value = null
  mergedViewerItems.value = archivedMessages
  mergedViewerCanGoBack.value = false
}
</script>

<template>
  <WindowChrome>
    <template #toolbar>
      <WorkspaceSearchField
        v-model="globalSearchQuery"
        data-testid="fixture-global-search"
        :label="t('workspace.globalSearch')"
        :status-label="activeMode === 'channels' ? t('channels.connection.connected') : undefined"
        :status-class="activeMode === 'channels' ? 'bg-success' : undefined"
      />
    </template>
    <div class="flex h-full min-w-0 overflow-hidden bg-canvas text-fg" data-testid="e2e-app">
      <WorkspaceRail
        :active-mode="activeMode"
        :pending-tasks="1"
        :logout-pending="false"
        :user="{ displayName: 'Jing Deng', preferredUsername: 'jing', avatarUrl: '' }"
        :im-profile="fixtureUserProfiles.get('fixture-account')"
        @select="
          (mode) => {
            if (mode === 'agent' || mode === 'channels' || mode === 'directory' || mode === 'tasks')
              activeMode = mode
          }
        "
      />

    <template v-if="activeMode === 'channels'">
      <ChannelSidebar
        :channels="channelLoading ? [] : channels"
        :drafts="imDrafts"
        :active-ref="channel.ref"
        :status="{ phase: 'connected', retryable: true }"
        :loading="channelLoading"
        :search-query="globalSearchQuery"
      />
      <ChannelConnectionPanel
        v-if="channelLoading"
        :status="{ phase: 'connected', retryable: true }"
        :error-code="null"
        managed-phase="ready"
        im-status="ready"
        :channels-loading="true"
        :pending="false"
      />
      <ChannelTimeline
        v-else
        :channel="channel"
        :messages="timelineMessages"
        :panel-open="drawerOpen"
        :loading="false"
        :has-more="true"
        :sending="false"
        :active-conversation="conversations[0] ?? null"
        :recent-conversations="conversations.slice(0, 4)"
        :current-session-available="true"
        :runtimes="availableRuntimes"
        :default-runtime-id="runtime.id"
        :selection-mode="selectingMessages"
        :selected-message-keys="selectedMessageKeys"
        :selected-count="selectedMessageKeys.length"
        :can-forward-individual="selectedMessageKeys.length > 0"
        :can-forward-merged="selectedMessageKeys.length > 0"
        :mention-members="mentionMembers"
        :mention-members-loading="false"
        :draft="imDraftText"
        @toggle-panel="drawerOpen = !drawerOpen"
        @toggle-message-selection="() => undefined"
        @select-all-visible="selectingMessages = true"
        @cancel-selection="selectingMessages = false"
        @forward-selection="openFixtureForwarding"
        @open-merged="openFixtureMergedMessage"
        @open-receipt-details="receiptDetailsOpen = true"
        @update-draft="imDraftText = $event.text"
      />
      <AgentDrawer
        :open="drawerOpen"
        :state="drawerState"
        :conversations="visibleConversations"
        :turns="turns"
        :collaboration="{ turnContexts: [], drafts: [], deliveries: [] }"
        :runtimes="availableRuntimes"
        :default-runtime-id="runtime.id"
        :model-options="fixtureModelOptions"
        :roles="fixtureRoles"
        @close="drawerOpen = false"
        @create="createSession"
        @create-with-runtime="createSessionWithRuntime"
        @select="selectSession"
        @view-all="drawerState.listMode = 'all'"
        @update-query="drawerState.query = $event"
        @update-text="drawerState.draft.text = $event"
        @update-attachments="drawerState.draft.attachments = $event"
        @select-runtime="drawerState.draft.runtimeId = $event"
        @select-model="drawerState.draft.model = $event"
        @select-permission="drawerState.draft.permissionMode = $event"
        @select-role="drawerState.draft.roleId = $event"
        @apply-role-prompt="drawerState.draft.text = injectPrompt(drawerState.draft.text, $event)"
        @send="send"
        @back="drawerState.phase = 'index'"
        @expand="activeMode = 'agent'"
        @create-draft="draftDialogOpen = true"
      />
      <ChannelPinnedMessagesDialog
        :open="fixture === 'pinned-messages'"
        :channel-name="channel.name"
        :items="pinnedMessages"
        :loading="false"
        :error-code="null"
      />
      <ChannelSavedMessagesDialog
        :open="fixture === 'saved-messages'"
        :items="savedMessages"
        :total-count="savedMessages.length"
        :loading="false"
        :loading-more="false"
        :has-more="true"
        :error-code="null"
        :removing-id="null"
      />
      <ChannelReceiptDetailsDialog
        :open="receiptDetailsOpen"
        :details="receiptDetails"
        :loading="false"
        :error-code="null"
        @close="receiptDetailsOpen = false"
      />
      <ChannelForwardDialog
        :open="forwardingMessages.length > 0"
        :messages="forwardingMessages"
        :channels="channels"
        :initial-mode="forwardingMode"
        :pending="false"
        @close="forwardingMessages = []"
        @confirm="forwardingMessages = []"
      />
      <ChannelMergedMessagesDialog
        :open="mergedViewerMessage !== null"
        :message="mergedViewerMessage"
        :items="mergedViewerItems"
        :loading="mergedViewerLoading"
        :error-code="mergedViewerErrorCode"
        :can-go-back="mergedViewerCanGoBack"
        @close="mergedViewerMessage = null"
        @retry="retryFixtureMergedMessages"
        @back="openFixtureMergedMessage(mergedMessage)"
        @open-merged="openFixtureMergedMessage"
      />
    </template>

    <DirectoryPage
      v-else-if="activeMode === 'directory'"
      :users="filteredDirectoryUsers"
      :total-count="directoryUsers.length"
      tenant-name="Tea Product Studio"
      phase="ready"
      :error-key="null"
      :query="directoryQuery"
      :action-error="null"
      @update:query="directoryQuery = $event"
      @message="directoryMessageUser = $event"
    />

    <TaskWorkspace v-else-if="activeMode === 'tasks'" :search-query="globalSearchQuery" />

    <template v-else>
      <ConversationSidebar
        :conversations="conversations"
        :active-id="conversations[0]?.conversationId ?? null"
        :runtimes="availableRuntimes"
        :default-runtime-id="runtime.id"
        :loading="false"
        :loading-more="false"
        :error="null"
        :has-more="false"
        :filter="{ kind: 'all' }"
        :search-query="globalSearchQuery"
        @new="createFullSession"
      />
      <main class="min-w-0 flex-1">
        <AgentConversationSurface
          v-model:text="fullText"
          v-model:attachments="fullAttachments"
          :profile="fullAgentProfile"
          title="Agent drawer architecture"
          :runtime-label="
            availableRuntimes.find((value) => value.id === fullRuntimeId)?.displayName
          "
          :turns="turns"
          collaboration
          has-older
          :runtimes="availableRuntimes"
          :runtime-id="fullRuntimeId"
          :model-options="fixtureModelOptions"
        :model="fullModel"
        :permission-mode="fullPermissionMode"
        :new-conversation="turns.length === 0"
        :roles="fixtureRoles"
        :role-id="fullRoleId"
        @select-runtime="fullRuntimeId = $event"
        @send="send"
          @select-model="fullModel = $event"
          @select-permission="fullPermissionMode = $event"
          @create-draft="draftDialogOpen = true"
          @select-role="fullRoleId = $event"
          @apply-role-prompt="fullText = injectPrompt(fullText, $event)"
        />
      </main>
    </template>

    <DraftEditorDialog
      :open="draftDialogOpen"
      :draft="draft"
      :delivery="delivery"
      @close="draftDialogOpen = false"
      @save="saveDraft"
      @deliver="deliverDraft"
    />
    </div>
  </WindowChrome>
</template>
