<script setup lang="ts">
import { computed } from 'vue'

import type { TaskCollaborator } from '../contracts'
import TaskActorAvatar from './TaskActorAvatar.vue'

const props = withDefaults(
  defineProps<{ collaborators: TaskCollaborator[]; mode?: 'list' | 'board' }>(),
  { mode: 'list' },
)

const visibleCollaborators = computed(() =>
  props.collaborators.slice(0, props.mode === 'list' ? 2 : 3),
)
const hiddenCount = computed(() => props.collaborators.length - visibleCollaborators.value.length)
const lead = computed(
  () => props.collaborators.find((collaborator) => collaborator.lead) ?? props.collaborators[0],
)
</script>

<template>
  <span
    v-if="mode === 'list'"
    class="flex min-w-0 items-center justify-end gap-1.5"
    data-testid="task-collaborators"
  >
    <span
      v-for="collaborator in visibleCollaborators"
      :key="collaborator.id"
      class="inline-flex h-7 min-w-0 max-w-32 items-center gap-1.5 rounded-pill border border-line bg-canvas px-1.5 pr-2"
      data-testid="task-collaborator"
    >
      <TaskActorAvatar :collaborator="collaborator" size="small" />
      <span class="truncate text-[11px] font-medium text-dim">{{ collaborator.role }}</span>
    </span>
    <span v-if="hiddenCount > 0" class="font-mono text-[11px] text-subtle">
      +{{ hiddenCount }}
    </span>
  </span>

  <span v-else-if="lead" class="flex min-w-0 items-center gap-2" data-testid="task-collaborators">
    <span class="flex shrink-0 -space-x-1.5">
      <TaskActorAvatar
        v-for="collaborator in visibleCollaborators"
        :key="collaborator.id"
        :collaborator="collaborator"
        size="small"
      />
    </span>
    <span class="min-w-0 truncate text-[11px] font-medium text-dim">{{ lead.role }}</span>
    <span v-if="hiddenCount > 0" class="shrink-0 font-mono text-[10px] text-subtle">
      +{{ hiddenCount }}
    </span>
  </span>
</template>
