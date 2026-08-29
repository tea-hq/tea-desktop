<script setup lang="ts">
import { computed } from 'vue'

import claudeCodeIcon from '../../assets/runtime-icons/claude-code.svg'
import codexIcon from '../../assets/runtime-icons/codex.svg'

const props = withDefaults(
  defineProps<{
    runtimeId: string
    label: string
    size?: 'small' | 'default'
  }>(),
  { size: 'default' },
)

const icons: Record<string, string> = {
  'external.claude': claudeCodeIcon,
  'external.codex': codexIcon,
}

const runtimeIcon = computed(() => icons[props.runtimeId])
const maskStyle = computed(() => {
  if (!runtimeIcon.value) return undefined
  const image = `url("${runtimeIcon.value}")`
  return { maskImage: image, WebkitMaskImage: image }
})
</script>

<template>
  <span
    :class="size === 'small' ? 'size-4' : 'size-5'"
    class="inline-flex shrink-0 items-center justify-center"
    role="img"
    :aria-label="label"
    :title="label"
  >
    <span
      v-if="runtimeIcon"
      :class="size === 'small' ? 'size-4' : 'size-[18px]'"
      class="bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
      :style="maskStyle"
      aria-hidden="true"
    />
    <span
      v-else
      :class="size === 'small' ? 'size-4' : 'size-[18px]'"
      class="i-mdi-console-line"
      aria-hidden="true"
    />
  </span>
</template>
