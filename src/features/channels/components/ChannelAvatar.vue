<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ChannelRef } from '../contracts'
import { channelAvatarInitials, channelAvatarTone } from './channelAvatarPresentation'

const props = defineProps<{
  channelRef: ChannelRef
  name: string
  avatarUrl?: string
}>()

const imageFailed = ref(false)
const initials = computed(() => channelAvatarInitials(props.name))
const tone = computed(() => channelAvatarTone(props.channelRef))
const showImage = computed(() => Boolean(props.avatarUrl) && !imageFailed.value)

const toneClasses = {
  'tone-0': 'bg-hover text-fg',
  'tone-1': 'bg-panel text-dim',
  'tone-2': 'bg-muted text-fg',
  'tone-3': 'bg-hover text-fg',
} as const

watch(
  () => props.avatarUrl,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <span
    class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
    :class="showImage ? 'bg-hover' : toneClasses[tone]"
    aria-hidden="true"
  >
    <img
      v-if="showImage"
      :src="avatarUrl"
      alt=""
      class="size-full object-cover"
      decoding="async"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="imageFailed = true"
    />
    <span v-else>{{ initials }}</span>
  </span>
</template>
