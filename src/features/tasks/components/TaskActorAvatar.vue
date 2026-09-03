<script setup lang="ts">
import { computed } from 'vue'

import RuntimeIcon from '@/shared/ui/RuntimeIcon.vue'
import type { TaskActor } from '../contracts'

const props = withDefaults(
  defineProps<{ actor: TaskActor; context?: string; size?: 'small' | 'default' }>(),
  { context: '', size: 'default' },
)

const initials = computed(() =>
  Array.from(props.actor.name).slice(0, 1).join('').toLocaleUpperCase(),
)
const runtimeId = computed(() =>
  props.actor.provider === 'claude' ? 'external.claude' : 'external.codex',
)
const label = computed(() =>
  props.context ? `${props.actor.name} · ${props.context}` : props.actor.name,
)
</script>

<template>
  <span
    :class="size === 'small' ? 'size-6' : 'size-8'"
    class="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-canvas"
    :title="label"
    :role="actor.kind === 'human' ? 'img' : undefined"
    :aria-label="actor.kind === 'human' ? label : undefined"
    :data-agent-provider="actor.kind === 'agent' ? actor.provider : undefined"
  >
    <RuntimeIcon
      v-if="actor.kind === 'agent'"
      :runtime-id="runtimeId"
      :label="label"
      :size="size"
      :class="actor.provider === 'claude' ? 'text-warning' : 'text-fg'"
    />
    <span v-else class="text-[10px] font-semibold text-dim" aria-hidden="true">
      {{ initials }}
    </span>
  </span>
</template>
