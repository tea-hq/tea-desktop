<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { fullAgentProfile } from '@/app/composerProfiles'
import WorkspaceRail from '@/app/components/WorkspaceRail.vue'
import ChannelSidebar from '@/features/channels/components/ChannelSidebar.vue'
import ChannelTimeline from '@/features/channels/components/ChannelTimeline.vue'
import type { Channel, Message } from '@/features/channels/contracts'
import AgentDrawer from '@/features/collaboration/components/AgentDrawer.vue'
import DraftEditorDialog from '@/features/collaboration/components/DraftEditorDialog.vue'
import type { AgentDrawerChannelState } from '@/features/collaboration/agentDrawerContracts'
import AgentConversationSurface from '@/features/conversation/components/AgentConversationSurface.vue'
import ConversationSidebar from '@/features/conversation/components/ConversationSidebar.vue'
import type { ComposerAttachment, ConversationSummary, ConversationTurn, RuntimeDescriptor } from '@/features/conversation/contracts'
import type { Delivery, Draft } from '@/types/channelCollaboration'

const params = new URLSearchParams(window.location.search)
const fixture = ref(params.get('fixture') ?? 'drawer-empty')
const { locale } = useI18n()
locale.value = params.get('lang') === 'zh-CN' ? 'zh-CN' : 'en'

const runtime: RuntimeDescriptor = {
  id: 'builtin.tea', kind: 'builtInTea', displayName: 'Tea Agent',
  capabilities: ['prompt', 'history', 'approval', 'cancel'], status: 'ready',
}
const binding = { transportId: 'fixture.im', accountRef: 'e2e-account', channelRef: 'product' }
const channel: Channel = {
  ref: binding.channelRef, kind: 'group', name: 'Product design', description: 'Desktop Agent experience',
  memberCount: 18, unreadCount: 3, updatedAt: 1_787_843_600_000, lastMessagePreview: 'The drawer direction is approved.',
}
const channels: Channel[] = [channel, {
  ref: 'engineering', kind: 'group', name: 'Engineering', description: 'Implementation coordination',
  memberCount: 24, unreadCount: 0, updatedAt: 1_787_843_000_000, lastMessagePreview: 'Type checks are green.',
}]
const messages: Message[] = [
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-1', messageServerId: 'server-1' },
    sender: { id: 'designer', name: 'Lin', isCurrentUser: false }, sentAt: 1_787_843_000_000,
    text: 'Can we move Agent collaboration into a drawer and keep the Channel timeline clean?',
    state: 'active', sentByCurrentUser: false, pinned: false, reactions: [{ type: 1, count: 3, active: false }],
  },
  {
    ref: { channelRef: channel.ref, messageClientId: 'message-2', messageServerId: 'server-2' },
    sender: { id: 'current', name: 'Jing', isCurrentUser: true }, sentAt: 1_787_843_300_000,
    text: 'Yes. The same conversation surface will be reused in drawer and full workspace modes.',
    state: 'active', sentByCurrentUser: true, pinned: false, reactions: [],
  },
]
const activeTurn: ConversationTurn = {
  id: 'turn-1', user: { id: 'prompt-1', text: 'Review the Agent drawer proposal.', attachments: [] },
  blocks: [{ kind: 'assistantText', id: 'block-1', sequence: 1, text: 'The drawer reduces persistent chrome while preserving model, permission, Role, attachment, source, and approval controls.', streaming: false }],
  status: 'completed', lastEventSequence: 2,
}
const approvalTurn: ConversationTurn = {
  id: 'turn-2', user: { id: 'prompt-2', text: 'Apply the approved visual changes.', attachments: [] },
  blocks: [{
    kind: 'toolCall', id: 'tool-1', sequence: 1, name: 'workspace.edit', status: 'approvalRequired',
    approval: { id: 'approval-1', toolCallId: 'tool-1', toolName: 'workspace.edit', capabilities: ['write'], resources: ['src/App.vue'], decisions: ['allowOnce', 'deny'], status: 'pending' },
  }],
  status: 'running', lastEventSequence: 1,
}
const conversations = ref<ConversationSummary[]>(Array.from({ length: 10 }, (_, index) => ({
  conversationId: `conversation-${index}`, runtimeId: runtime.id, workspaceId: 'e2e',
  title: index === 0 ? 'Agent drawer architecture' : `Product session ${index + 1}`,
  lastMessagePreview: 'Reviewing interaction details and implementation state.',
  createdAt: 1_787_840_000_000 + index, updatedAt: 1_787_843_000_000 + index, channelBinding: binding,
})))
const initialPhase = fixture.value === 'drawer-empty' || fixture.value === 'drawer-recent' ? 'index'
  : fixture.value === 'drawer-preparing' ? 'preparing' : 'active'
const drawerState = reactive<AgentDrawerChannelState>({
  binding, phase: initialPhase, listMode: 'recent', query: '', scrollOffset: 0,
  selectedConversationId: initialPhase === 'active' ? conversations.value[0]!.conversationId : null,
  draft: {
    runtimeId: runtime.id, model: 'default', permissionMode: 'default', roleId: null,
    text: initialPhase === 'preparing' ? 'Create a concise implementation plan' : '', attachments: [], sources: [],
    creationIdempotencyKey: 'e2e:first-send', conversationId: initialPhase === 'active' ? conversations.value[0]!.conversationId : null,
  },
})
const drawerOpen = ref(fixture.value.startsWith('drawer'))
const turns = ref<ConversationTurn[]>(fixture.value === 'drawer-active' || fixture.value === 'draft-dialog' || fixture.value === 'full-agent'
  ? [activeTurn, approvalTurn] : [])
const fullText = ref('')
const fullAttachments = ref<ComposerAttachment[]>([])
const activeMode = ref<'channels' | 'agent'>(fixture.value === 'full-agent' ? 'agent' : 'channels')
const draftDialogOpen = ref(fixture.value === 'draft-dialog')
const draft = ref<Draft>({
  draftId: 'draft-1', conversationId: conversations.value[0]!.conversationId, sourceTurnIndex: 0,
  sourceBlockId: 'block-1', currentVersion: 1, content: 'Share the reviewed drawer implementation with the Channel.',
  createdAt: 1_787_843_400_000, updatedAt: 1_787_843_400_000,
})
const delivery = ref<Delivery | undefined>()
const visibleConversations = computed(() => fixture.value === 'drawer-empty' && drawerState.phase === 'index'
  ? []
  : conversations.value)

function createSession(): void { drawerState.phase = 'preparing'; drawerState.selectedConversationId = null }
function selectSession(id: string): void { drawerState.phase = 'active'; drawerState.selectedConversationId = id; drawerState.draft.conversationId = id }
function send(payload: { text: string; attachments: ComposerAttachment[] }): void {
  if (drawerState.phase === 'preparing') {
    const summary: ConversationSummary = { conversationId: 'conversation-created', runtimeId: runtime.id, workspaceId: 'e2e', title: 'New Agent session', createdAt: Date.now(), updatedAt: Date.now(), channelBinding: binding }
    conversations.value.unshift(summary)
    drawerState.phase = 'active'
    drawerState.selectedConversationId = summary.conversationId
    drawerState.draft.conversationId = summary.conversationId
  }
  turns.value.push({ id: `turn-${turns.value.length + 1}`, user: { id: crypto.randomUUID(), text: payload.text, attachments: [] }, blocks: [], status: 'running', lastEventSequence: 0 })
  drawerState.draft.text = ''
}
function saveDraft(content: string): void { draft.value = { ...draft.value, content, currentVersion: draft.value.currentVersion + 1, updatedAt: Date.now() } }
function deliverDraft(): void {
  delivery.value = { deliveryId: 'delivery-1', draftId: draft.value.draftId, draftVersion: draft.value.currentVersion, channelBinding: binding, idempotencyKey: 'e2e:delivery', status: 'sent', createdAt: Date.now(), updatedAt: Date.now() }
}
</script>

<template>
  <div class="flex h-screen min-w-0 overflow-hidden tea-bg-canvas tea-fg" data-testid="e2e-app">
    <WorkspaceRail :active-mode="activeMode" :pending-tasks="1" :logout-pending="false" :user="{ displayName: 'Jing Deng', preferredUsername: 'jing', avatarUrl: '' }" @select="mode => { if (mode === 'agent' || mode === 'channels') activeMode = mode }" />

    <template v-if="activeMode === 'channels'">
      <ChannelSidebar :channels="channels" :active-ref="channel.ref" :status="{ phase: 'connected', retryable: true }" />
      <ChannelTimeline :channel="channel" :messages="messages" :panel-open="drawerOpen" :loading="false" :has-more="true" :sending="false" :active-conversation="conversations[0] ?? null" :recent-conversations="conversations.slice(0, 4)" :current-session-available="true" :runtimes="[runtime]" :default-runtime-id="runtime.id" @toggle-panel="drawerOpen = !drawerOpen" />
      <AgentDrawer
        :open="drawerOpen" channel-name="Product design" :state="drawerState" :conversations="visibleConversations"
        :turns="turns" :collaboration="{ turnContexts: [], drafts: [], deliveries: [] }" :runtimes="[runtime]"
        :model-options="[{ value: 'default', label: 'Default model' }]" :roles="[{ id: 'reviewer', name: 'Reviewer', revision: 2, runtimeId: runtime.id }]"
        @close="drawerOpen = false" @create="createSession" @select="selectSession" @view-all="drawerState.listMode = 'all'"
        @update-query="drawerState.query = $event" @update-text="drawerState.draft.text = $event" @update-attachments="drawerState.draft.attachments = $event"
        @select-runtime="drawerState.draft.runtimeId = $event" @select-model="drawerState.draft.model = $event" @select-permission="drawerState.draft.permissionMode = $event"
        @select-role="drawerState.draft.roleId = $event" @send="send" @back="drawerState.phase = 'index'" @expand="activeMode = 'agent'"
        @create-draft="draftDialogOpen = true"
      />
    </template>

    <template v-else>
      <ConversationSidebar :conversations="conversations" :active-id="conversations[0]?.conversationId ?? null" :runtimes="[runtime]" :loading="false" :loading-more="false" :error="null" :has-more="false" :filter="{ kind: 'all' }" />
      <main class="min-w-0 flex-1">
        <AgentConversationSurface v-model:text="fullText" v-model:attachments="fullAttachments" :profile="fullAgentProfile" title="Agent drawer architecture" runtime-label="Tea Agent" :turns="turns" collaboration has-older :runtimes="[runtime]" :runtime-id="runtime.id" :model-options="[{ value: 'default', label: 'Default model' }]" model="default" permission-mode="default" :roles="[{ id: 'reviewer', name: 'Reviewer', revision: 2, runtimeId: runtime.id }]" @send="send" @create-draft="draftDialogOpen = true" />
      </main>
    </template>

    <DraftEditorDialog :open="draftDialogOpen" :draft="draft" :delivery="delivery" @close="draftDialogOpen = false" @save="saveDraft" @deliver="deliverDraft" />
  </div>
</template>
