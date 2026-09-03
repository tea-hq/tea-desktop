<script setup lang="ts">
import { computed } from 'vue'

import RuntimeIcon from '@/shared/ui/RuntimeIcon.vue'
import type { TaskCollaborator } from '../contracts'

const props = withDefaults(
  defineProps<{ collaborator: TaskCollaborator; size?: 'small' | 'default' }>(),
  { size: 'default' },
)

const initials = computed(() =>
  Array.from(props.collaborator.name).slice(0, 1).join('').toLocaleUpperCase(),
)
const runtimeId = computed(() =>
  props.collaborator.provider === 'claude' ? 'external.claude' : 'external.codex',
)
const label = computed(() => `${props.collaborator.name} · ${props.collaborator.role}`)
</script>

<template>
  <span
    :class="size === 'small' ? 'size-6' : 'size-8'"
    class="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-canvas"
    :title="label"
    :data-agent-provider="collaborator.kind === 'agent' ? collaborator.provider : undefined"
  >
    <RuntimeIcon
      v-if="collaborator.kind === 'agent'"
      :runtime-id="runtimeId"
      :label="label"
      :size="size"
      :class="collaborator.provider === 'claude' ? 'text-warning' : 'text-fg'"
    />
    <span v-else class="text-[10px] font-semibold text-dim" aria-hidden="true">
      {{ initials }}
    </span>
  </span>
</template>
