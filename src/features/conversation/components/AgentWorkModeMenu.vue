<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaMenuSelect } from '@/shared/ui'

export type AgentWorkMode = 'local' | 'cloud'

const props = withDefaults(
  defineProps<{
    modelValue?: AgentWorkMode
    label: string
    disabled?: boolean
  }>(),
  { modelValue: 'local', disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: AgentWorkMode] }>()
const { t } = useI18n()
const options = computed(() => [
  { value: 'local' as const, label: t('composer.agentMode.local') },
  { value: 'cloud' as const, label: t('composer.agentMode.cloud') },
])
</script>

<template>
  <TeaMenuSelect
    class="agent-work-mode-menu"
    :model-value="props.modelValue"
    :options="options"
    :label="label"
    icon="i-mdi-laptop"
    size="small"
    menu-placement="up"
    :disabled="disabled"
    @update:model-value="$event && emit('update:modelValue', $event as AgentWorkMode)"
  />
</template>
