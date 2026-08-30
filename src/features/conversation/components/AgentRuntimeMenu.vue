<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaIconMenu } from '@/shared/ui'
import type { RuntimeDescriptor } from '../contracts'

const props = defineProps<{
  runtimes: RuntimeDescriptor[]
  defaultRuntimeId?: string | null
  label: string
  menuLabel: string
}>()
const emit = defineEmits<{ select: [runtimeId: string] }>()
const { t } = useI18n()

const items = computed(() =>
  props.runtimes.map((runtime) => ({
    value: runtime.id,
    label: `${runtime.displayName}${
      runtime.id === props.defaultRuntimeId ? ` (${t('channels.collaboration.defaultLabel')})` : ''
    }${runtime.status === 'ready' ? '' : ` · ${t(`status.${runtime.status}`)}`}`,
    icon: runtime.status === 'ready' ? 'i-mdi-creation-outline' : 'i-mdi-alert-circle-outline',
    disabled: runtime.status !== 'ready',
    selected: runtime.id === props.defaultRuntimeId,
  })),
)
</script>

<template>
  <TeaIconMenu
    :items="items"
    :label="label"
    :menu-label="menuLabel"
    menu-placement="up"
    icon="i-mdi-account-switch-outline"
    size="small"
    @select="emit('select', $event)"
  />
</template>
