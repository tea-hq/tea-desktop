<script setup lang="ts">
import { ref } from 'vue'

import { drawerAgentProfile, fullAgentProfile } from '@/app/composerProfiles'
import type { ConversationTurn, RuntimeDescriptor } from '../contracts'
import AgentConversationSurface from './AgentConversationSurface.vue'

const runtime: RuntimeDescriptor = {
  id: 'external.claude',
  kind: 'externalCli',
  displayName: 'Claude Code',
  capabilities: ['prompt', 'history', 'approval', 'cancel'],
  status: 'ready',
}
const text = ref('')
const attachments = ref([
  { id: 'brief', name: 'product-requirements-with-a-long-name.md', size: 4096 },
])
const activeTurn: ConversationTurn = {
  id: 'turn-1',
  user: {
    id: 'prompt-1',
    text: 'Review the drawer interaction and identify any usability risks.',
    attachments: [],
  },
  blocks: [
    {
      kind: 'assistantText',
      id: 'block-1',
      sequence: 1,
      text: 'The drawer keeps the Channel canvas focused while preserving Agent context.',
      streaming: false,
    },
  ],
  status: 'completed',
  lastEventSequence: 2,
}
const approvalTurn: ConversationTurn = {
  id: 'turn-2',
  user: { id: 'prompt-2', text: 'Apply the proposed changes.', attachments: [] },
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
</script>

<template>
  <Story title="Agent/Conversation surface" group="Agent">
    <Variant title="Full workspace empty">
      <div class="h-[760px] w-[1100px]">
        <AgentConversationSurface
          v-model:text="text"
          v-model:attachments="attachments"
          :profile="fullAgentProfile"
          title="New conversation"
          runtime-label="Claude Code"
          :turns="[]"
          :runtimes="[runtime]"
          :runtime-id="runtime.id"
          :model-options="[{ value: 'default', label: 'Default model' }]"
          model="default"
          permission-mode="default"
        />
      </div>
    </Variant>
    <Variant title="Full active history">
      <div class="h-[760px] w-[1100px]">
        <AgentConversationSurface
          v-model:text="text"
          v-model:attachments="attachments"
          :profile="fullAgentProfile"
          title="Drawer architecture review"
          runtime-label="Claude Code"
          :turns="[activeTurn]"
          :runtimes="[runtime]"
          :runtime-id="runtime.id"
          :model-options="[{ value: 'default', label: 'Default model' }]"
          model="default"
          permission-mode="readOnly"
        />
      </div>
    </Variant>
    <Variant title="Drawer streaming and approval">
      <div class="h-[720px] w-[480px]">
        <AgentConversationSurface
          v-model:text="text"
          v-model:attachments="attachments"
          :profile="drawerAgentProfile"
          title="Implementation"
          subtitle="Product team"
          back-label="Back"
          expand-label="Expand"
          :turns="[activeTurn, approvalTurn]"
          :runtimes="[runtime]"
          :runtime-id="runtime.id"
          :model-options="[{ value: 'default', label: 'Default model' }]"
          model="default"
          permission-mode="default"
          streaming
        />
      </div>
    </Variant>
    <Variant title="Failure and retry">
      <div class="h-[640px] w-[480px]">
        <AgentConversationSurface
          v-model:text="text"
          v-model:attachments="attachments"
          :profile="drawerAgentProfile"
          title="Failed session"
          :turns="[activeTurn]"
          error="The Runtime connection was interrupted."
          :runtimes="[runtime]"
          :runtime-id="runtime.id"
          :model-options="[{ value: 'default' }]"
          model="default"
          permission-mode="default"
        />
      </div>
    </Variant>
    <Variant title="Long Chinese content">
      <div class="h-[720px] w-[480px]">
        <AgentConversationSurface
          v-model:text="text"
          v-model:attachments="attachments"
          :profile="drawerAgentProfile"
          title="跨团队协作与桌面端 Agent 会话体验一致性评审"
          subtitle="产品设计与客户端联合工作组"
          :turns="[activeTurn]"
          :runtimes="[runtime]"
          :runtime-id="runtime.id"
          :model-options="[{ value: 'default', label: '默认模型与超长本地化展示名称' }]"
          model="default"
          permission-mode="default"
        />
      </div>
    </Variant>
  </Story>
</template>
