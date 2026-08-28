<script setup lang="ts">
import type { AgentDrawerChannelState } from '../agentDrawerContracts'
import type { ConversationSummary, RuntimeDescriptor } from '@/features/conversation/contracts'
import AgentDrawer from './AgentDrawer.vue'

const runtime: RuntimeDescriptor = { id: 'external.claude', kind: 'externalCli', displayName: 'Claude Code', capabilities: ['prompt', 'history'], status: 'ready' }
const binding = { transportId: 'yunxin', accountRef: 'account-1', channelRef: 'product' }
const emptyState: AgentDrawerChannelState = {
  binding, phase: 'index', listMode: 'recent', query: '', scrollOffset: 0, selectedConversationId: null,
  draft: { runtimeId: runtime.id, model: 'default', permissionMode: 'default', roleId: null, text: '', attachments: [], sources: [], creationIdempotencyKey: 'drawer:story', conversationId: null },
}
const conversations: ConversationSummary[] = Array.from({ length: 10 }, (_, index) => ({
  conversationId: `session-${index}`, runtimeId: runtime.id, workspaceId: 'workspace', title: `Agent session ${index + 1}`,
  lastMessagePreview: 'Reviewing the current implementation and interaction details.', createdAt: index, updatedAt: index, channelBinding: binding,
}))
const activeState: AgentDrawerChannelState = {
  ...emptyState, phase: 'active', selectedConversationId: conversations[0]!.conversationId,
  draft: { ...emptyState.draft, conversationId: conversations[0]!.conversationId, text: 'Continue the implementation' },
}
</script>

<template>
  <Story title="Agent/Channel drawer" group="Agent">
    <Variant title="No history"><div class="h-[760px] w-[1100px]"><AgentDrawer open channel-name="Product" :state="emptyState" :conversations="[]" :turns="[]" :collaboration="{ turnContexts: [], drafts: [], deliveries: [] }" :runtimes="[runtime]" :model-options="[{ value: 'default' }]" /></div></Variant>
    <Variant title="Recent sessions"><div class="h-[760px] w-[1100px]"><AgentDrawer open channel-name="Product" :state="emptyState" :conversations="conversations" :turns="[]" :collaboration="{ turnContexts: [], drafts: [], deliveries: [] }" :runtimes="[runtime]" :model-options="[{ value: 'default' }]" /></div></Variant>
    <Variant title="Active detail"><div class="h-[760px] w-[1100px]"><AgentDrawer open channel-name="Product" :state="activeState" :conversations="conversations" :turns="[]" :collaboration="{ turnContexts: [], drafts: [], deliveries: [] }" :runtimes="[runtime]" :model-options="[{ value: 'default' }]" /></div></Variant>
  </Story>
</template>
