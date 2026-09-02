<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { fullAgentProfile } from '@/app/composerProfiles'
import WorkspaceRail from '@/app/components/WorkspaceRail.vue'
import WindowChrome from '@/app/components/WindowChrome.vue'
import ChannelConnectionPanel from '@/features/channels/components/ChannelConnectionPanel.vue'
import ChannelSidebar from '@/features/channels/components/ChannelSidebar.vue'
import ChannelTimeline from '@/features/channels/components/ChannelTimeline.vue'
import type { Channel, Message } from '@/features/channels/contracts'
import AgentDrawer from '@/features/collaboration/components/AgentDrawer.vue'
import DraftEditorDialog from '@/features/collaboration/components/DraftEditorDialog.vue'
import type { AgentDrawerChannelState } from '@/features/collaboration/agentDrawerContracts'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import ConversationSidebar from '@/features/conversation/components/ConversationSidebar.vue'
import DirectoryPage from '@/features/directory/components/DirectoryPage.vue'
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
import { TeaInput } from '@/shared/ui'

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
const channel: Channel = {
  ref: binding.channelRef,
  kind: 'group',
  name: 'Product design',
  description: 'Desktop Agent experience',
  memberCount: 18,
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
    unreadCount: 0,
    updatedAt: 1_787_843_000_000,
    lastMessagePreview: 'Type checks are green.',
  },
]
const messages: Message[] = [
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-1', messageServerId: 'server-1' },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false },
    sentAt: 1_787_843_000_000,
    text: 'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
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
    state: 'active',
    sentByCurrentUser: true,
    pinned: false,
    reactions: [],
  },
]
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
const activeMode = ref<'channels' | 'agent' | 'directory'>(
  fixture.value.startsWith('directory')
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
</script>

<template>
  <WindowChrome>
    <template #toolbar>
      <div class="relative w-full" data-testid="fixture-global-search">
        <span
          class="i-mdi-magnify pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <TeaInput
          v-model="globalSearchQuery"
          size="small"
          type="search"
          class="workspace-global-search__input min-h-9 pl-9 pr-3 text-sm"
          :label="t('workspace.globalSearch')"
          :placeholder="t('workspace.globalSearch')"
        />
      </div>
    </template>
    <div class="flex h-full min-w-0 overflow-hidden bg-canvas text-fg" data-testid="e2e-app">
      <WorkspaceRail
        :active-mode="activeMode"
        :pending-tasks="1"
        :logout-pending="false"
        :user="{ displayName: 'Jing Deng', preferredUsername: 'jing', avatarUrl: '' }"
        @select="
          (mode) => {
            if (mode === 'agent' || mode === 'channels' || mode === 'directory') activeMode = mode
          }
        "
      />

      <template v-if="activeMode === 'channels'">
        <ChannelSidebar
          :channels="channelLoading ? [] : channels"
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
          :messages="messages"
          :panel-open="drawerOpen"
          :loading="false"
          :has-more="true"
          :sending="false"
          :active-conversation="conversations[0] ?? null"
          :recent-conversations="conversations.slice(0, 4)"
          :current-session-available="true"
          :runtimes="availableRuntimes"
          :default-runtime-id="runtime.id"
          @toggle-panel="drawerOpen = !drawerOpen"
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
          @new-with-runtime="createFullSessionWithRuntime"
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
            :roles="fixtureRoles"
            :role-id="fullRoleId"
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
