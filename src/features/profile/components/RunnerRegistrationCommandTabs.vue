<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton, TeaTabs, type TeaTabOption } from '@/shared/ui'
import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../../packages/runner/src/protocol'
import {
  createRunnerRegistrationCommandOptions,
  type RunnerInstallTool,
  type RunnerRegistrationCommandOption,
} from '../runnerRegistrationCommands'

const props = defineProps<{
  registration: RunnerRegistrationCommand
  token: RunnerTokenView
}>()

const { t } = useI18n()
const activeTool = ref<RunnerInstallTool>('npx')
const copiedTool = ref<RunnerInstallTool | null>(null)
const commandOptions = computed(() =>
  createRunnerRegistrationCommandOptions(props.registration, props.token),
)
const toolTabs = computed<TeaTabOption[]>(() =>
  commandOptions.value.map((option) => ({
    value: option.tool,
    label: t(`profile.runnerTokens.installTools.${option.tool}`),
  })),
)
let copyResetTimer: number | null = null

watch(
  () => props.registration.tokenId,
  () => {
    activeTool.value = 'npx'
    copiedTool.value = null
  },
)

onUnmounted(() => {
  if (copyResetTimer !== null) window.clearTimeout(copyResetTimer)
})

function selectTool(value: string): void {
  if (commandOptions.value.some((option) => option.tool === value)) {
    activeTool.value = value as RunnerInstallTool
  }
}

async function copyCommand(option: RunnerRegistrationCommandOption): Promise<void> {
  await navigator.clipboard.writeText(option.command)
  copiedTool.value = option.tool
  if (copyResetTimer !== null) window.clearTimeout(copyResetTimer)
  copyResetTimer = window.setTimeout(() => {
    copiedTool.value = null
    copyResetTimer = null
  }, 1500)
}
</script>

<template>
  <TeaTabs
    class="runner-install-tabs min-w-0"
    :model-value="activeTool"
    :tabs="toolTabs"
    :label="t('profile.runnerTokens.installMethodLabel')"
    @update:model-value="selectTool"
  >
    <template v-for="option in commandOptions" #[option.tool] :key="option.tool">
      <p
        v-if="option.preview"
        class="mb-2 inline-flex min-h-6 items-center rounded-structural bg-hover px-2 text-xs font-medium text-dim"
      >
        {{ t('profile.runnerTokens.installPreview') }}
      </p>
      <div class="relative rounded-structural bg-canvas">
        <pre
          :data-testid="`runner-command-${option.tool}`"
          class="max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 pr-14 font-mono text-xs leading-5 text-fg"
          >{{ option.command }}</pre>
        <TeaIconButton
          class="absolute right-2 top-2"
          size="small"
          appearance="primary"
          :label="copiedTool === option.tool ? t('common.copied') : t('common.copy')"
          :tooltip="copiedTool === option.tool ? t('common.copied') : t('common.copy')"
          :icon="copiedTool === option.tool ? 'i-mdi-check' : 'i-mdi-content-copy'"
          @click="copyCommand(option)"
        />
      </div>
    </template>
  </TeaTabs>
</template>

<style scoped>
.runner-install-tabs :deep(.nav-pill-group__item) {
  flex: 0 0 auto;
}
</style>
