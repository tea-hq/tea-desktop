<script setup lang="ts">
import { computed } from 'vue'

import type { TaskCollaborator } from '../contracts'
import TaskActorAvatar from './TaskActorAvatar.vue'

const props = withDefaults(
  defineProps<{ collaborators: TaskCollaborator[]; mode?: 'list' | 'board' }>(),
  { mode: 'list' },
)

const visibleCollaborators = computed(() => props.collaborators.slice(0, 4))
const hiddenCount = computed(() => props.collaborators.length - visibleCollaborators.value.length)
const groupLabel = computed(() =>
  props.collaborators
    .map((collaborator) => `${collaborator.name} · ${collaborator.role}`)
    .join(', '),
)
</script>

<template>
  <span
    v-if="collaborators.length > 0"
    :class="mode === 'list' ? 'justify-end' : 'justify-start'"
    class="flex h-7 min-w-0 items-center"
    role="group"
    :aria-label="groupLabel"
    data-testid="task-collaborators"
  >
    <span class="isolate flex shrink-0 -space-x-2">
      <span
        v-for="collaborator in visibleCollaborators"
        :key="collaborator.id"
        class="relative inline-flex rounded-full bg-canvas p-0.5"
        data-testid="task-collaborator"
      >
        <TaskActorAvatar :actor="collaborator" :context="collaborator.role" size="small" />
      </span>
    </span>
    <span v-if="hiddenCount > 0" class="ml-1.5 shrink-0 font-mono text-[11px] text-subtle">
      +{{ hiddenCount }}
    </span>
  </span>
</template>
