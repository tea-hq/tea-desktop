<script setup lang="ts">
import { ref } from 'vue'

import TeaButton from './TeaButton.vue'
import TeaEmptyState from './TeaEmptyState.vue'
import TeaInput from './TeaInput.vue'
import TeaMessageBar from './TeaMessageBar.vue'
import TeaSelect from './TeaSelect.vue'

const name = ref('')
const runtime = ref<string | null>('external.claude')
const runtimes = [
  { value: 'external.claude', label: 'Claude Code' },
  { value: 'external.codex', label: 'Codex CLI with an intentionally long provider label' },
]
</script>

<template>
  <Story title="Design system/Tea primitives" group="Shared UI">
    <Variant title="English states">
      <div class="grid max-w-xl gap-4 p-6">
        <TeaInput v-model="name" label="Workspace name" placeholder="Enter a name" />
        <TeaInput model-value="Invalid value" label="Invalid field" invalid />
        <TeaSelect v-model="runtime" :options="runtimes" label="Runtime" />
        <div class="flex flex-wrap gap-2">
          <TeaButton appearance="primary">Create conversation</TeaButton>
          <TeaButton>Secondary</TeaButton>
          <TeaButton loading>Loading</TeaButton>
          <TeaButton disabled>Disabled</TeaButton>
        </div>
        <TeaMessageBar tone="error">The Runtime could not be reached.</TeaMessageBar>
      </div>
    </Variant>
    <Variant title="Chinese and long labels">
      <div class="max-w-xl p-6">
        <TeaEmptyState
          title="此频道还没有 Agent 会话"
          description="选择默认 Runtime，然后在首次发送消息时创建会话。"
        >
          <template #actions
            ><TeaButton appearance="primary">使用默认 Runtime 创建新会话</TeaButton></template
          >
        </TeaEmptyState>
      </div>
    </Variant>
    <Variant title="Reduced motion and focus">
      <div class="flex gap-2 p-6" style="animation: none">
        <TeaButton appearance="primary" autofocus>Focused action</TeaButton>
        <TeaButton loading>Working</TeaButton>
      </div>
    </Variant>
  </Story>
</template>
