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
  'tone-0': 'tea-bg-hover tea-fg',
  'tone-1': 'tea-bg-muted tea-fg-muted',
  'tone-2': 'tea-bg-disabled tea-fg',
  'tone-3': 'tea-bg-hover tea-fg',
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
    class="flex size-8 shrink-0 items-center justify-center overflow-hidden tea-radius-pill tea-text-caption tea-weight-strong"
    :class="showImage ? 'tea-bg-hover' : toneClasses[tone]"
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
