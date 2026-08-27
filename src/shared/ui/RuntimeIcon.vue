<script setup lang="ts">
import { computed } from 'vue'

import claudeCodeIcon from '../../assets/runtime-icons/claude-code.svg'
import codexIcon from '../../assets/runtime-icons/codex.svg'
import teaIcon from '../../assets/runtime-icons/tea.svg'

const props = defineProps<{
  runtimeId: string
  label: string
}>()

const icons: Record<string, string> = {
  'builtin.tea': teaIcon,
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
    class="inline-flex size-5 shrink-0 items-center justify-center"
    role="img"
    :aria-label="label"
    :title="label"
  >
    <span
      v-if="runtimeIcon"
      class="size-[18px] bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
      :style="maskStyle"
      aria-hidden="true"
    />
    <span v-else class="i-mdi-console-line size-[18px]" aria-hidden="true" />
  </span>
</template>
