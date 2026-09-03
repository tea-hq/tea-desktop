<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string
    fallbackSrc?: string
    fallbackText: string
    fallbackClass?: string
    size?: 'small' | 'default' | 'medium' | 'large' | 'fill'
  }>(),
  {
    src: '',
    fallbackSrc: '',
    fallbackClass: 'bg-muted text-dim',
    size: 'default',
  },
)

const failedSources = ref<Set<string>>(new Set())
const imageSrc = computed(() => {
  const candidates = [props.src, props.fallbackSrc].filter(Boolean)
  return candidates.find((candidate) => !failedSources.value.has(candidate)) ?? ''
})
const sizeClasses = computed(
  () =>
    ({
      small: 'size-7 text-xs',
      default: 'size-8 text-sm',
      medium: 'size-10 text-sm',
      large: 'size-16 text-xl',
      fill: 'size-full text-sm',
    })[props.size],
)

function handleImageError(): void {
  if (!imageSrc.value) return
  failedSources.value = new Set(failedSources.value).add(imageSrc.value)
}

watch(
  () => [props.src, props.fallbackSrc],
  () => {
    failedSources.value = new Set()
  },
)
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
    :class="[sizeClasses, imageSrc ? 'bg-hover' : fallbackClass]"
    aria-hidden="true"
  >
    <img
      v-if="imageSrc"
      :src="imageSrc"
      alt=""
      class="size-full object-cover"
      decoding="async"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="handleImageError"
    />
    <span v-else>{{ fallbackText }}</span>
  </span>
</template>
