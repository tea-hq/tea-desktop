<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ChannelPresenceAvailability } from '../contracts'

const props = withDefaults(
  defineProps<{
    availability: ChannelPresenceAvailability
    size?: 'avatar' | 'inline'
  }>(),
  { size: 'inline' },
)

const { t } = useI18n()
const label = computed(() => t(`channels.presence.${props.availability}`))
</script>

<template>
  <span
    class="channel-presence-indicator"
    :class="[`channel-presence-indicator--${availability}`, `channel-presence-indicator--${size}`]"
    :data-channel-presence="availability"
    role="img"
    :aria-label="label"
    :title="label"
  />
</template>

<style scoped>
.channel-presence-indicator {
  display: inline-block;
  flex: none;
  box-sizing: border-box;
  border-radius: var(--tea-radius-pill);
}

.channel-presence-indicator--avatar {
  width: 0.625rem;
  height: 0.625rem;
  outline: 2px solid var(--tea-canvas);
}

.channel-presence-indicator--inline {
  width: 0.5rem;
  height: 0.5rem;
}

.channel-presence-indicator--online {
  background: var(--tea-success);
}

.channel-presence-indicator--offline {
  border: 1.5px solid var(--tea-subtle);
  background: var(--tea-canvas);
}

.channel-presence-indicator--unknown {
  background: var(--tea-subtle);
}
</style>
