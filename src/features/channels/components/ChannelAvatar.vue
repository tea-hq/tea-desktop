<script setup lang="ts">
import { computed } from 'vue'

import { createDefaultAvatarDataUri } from '@/shared/avatar/defaultAvatar'
import { TeaAvatar } from '@/shared/ui'

import type { ChannelRef, ChannelUserProfile } from '../contracts'
import { channelAvatarInitials, channelAvatarTone } from './channelAvatarPresentation'

const props = defineProps<{
  channelRef: ChannelRef
  name: string
  avatarUrl?: string
  accountId?: string
  userProfile?: ChannelUserProfile | null
}>()

const avatarName = computed(() => props.userProfile?.name || props.name)
const initials = computed(() => channelAvatarInitials(avatarName.value))
const tone = computed(() => channelAvatarTone(props.channelRef))
const source = computed(() => props.userProfile?.avatarUrl || props.avatarUrl)
const fallbackSource = computed(() => {
  const accountId = props.userProfile?.accountId?.trim() || props.accountId?.trim()
  return accountId ? createDefaultAvatarDataUri(`tea:account:${accountId}`) : ''
})

const toneClasses = {
  'tone-0': 'bg-hover text-fg',
  'tone-1': 'bg-panel text-dim',
  'tone-2': 'bg-muted text-fg',
  'tone-3': 'bg-hover text-fg',
} as const
</script>

<template>
  <TeaAvatar
    :src="source"
    :fallback-src="fallbackSource"
    :fallback-text="initials"
    :fallback-class="toneClasses[tone]"
  />
</template>
