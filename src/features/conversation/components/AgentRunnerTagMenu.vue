<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaMenuSelect } from '@/shared/ui'
import type { CloudRunnerTag } from '../../../../packages/runner/src/protocol'

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    tags: CloudRunnerTag[]
    label: string
    placeholder: string
    disabled?: boolean
  }>(),
  { modelValue: null, disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
const options = computed(() =>
  props.tags.map((value) => ({
    value: value.tag,
    label: t('composer.runnerTagAvailability', {
      tag: value.tag,
      available: value.available,
      busy: value.busy,
    }),
  })),
)
</script>

<template>
  <TeaMenuSelect
    class="agent-runner-tag-menu"
    :model-value="props.modelValue"
    :options="options"
    :label="label"
    :placeholder="props.modelValue ? undefined : placeholder"
    icon="i-mdi-server-network"
    size="small"
    menu-placement="up"
    :disabled="disabled || options.length === 0"
    @update:model-value="$event && emit('update:modelValue', String($event))"
  />
</template>
