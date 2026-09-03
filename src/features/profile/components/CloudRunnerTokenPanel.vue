<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaIconButton, TeaTabs, type TeaTabOption } from '@/shared/ui'
import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../../packages/runner/src/protocol'
import RunnerTokenAudiencePanel from './RunnerTokenAudiencePanel.vue'

type RunnerTokenAudience = 'enterprise' | 'personal'

const props = withDefaults(
  defineProps<{
    tokens?: RunnerTokenView[]
    selectedTokenId?: string | null
    command?: RunnerRegistrationCommand | null
    loading?: boolean
    commandLoading?: boolean
    error?: string | null
    commandError?: string | null
    offline?: boolean
  }>(),
  {
    tokens: () => [],
    selectedTokenId: null,
    command: null,
    loading: false,
    commandLoading: false,
    error: null,
    commandError: null,
    offline: false,
  },
)

const emit = defineEmits<{
  refresh: []
  selectToken: [tokenId: string]
  resetPersonal: []
}>()

const { t } = useI18n()
const enterpriseTokens = computed(() => props.tokens.filter((token) => token.scope !== 'user'))
const personalTokens = computed(() => props.tokens.filter((token) => token.scope === 'user'))
const activeAudience = ref<RunnerTokenAudience>(initialAudience())
const audienceTabs = computed<TeaTabOption[]>(() => [
  { value: 'enterprise', label: t('profile.runnerTokens.audience.enterprise') },
  { value: 'personal', label: t('profile.runnerTokens.audience.personal') },
])

watch(
  () => props.selectedTokenId,
  (tokenId) => {
    const audience = audienceForToken(tokenId)
    if (audience) activeAudience.value = audience
  },
)

function initialAudience(): RunnerTokenAudience {
  return (
    audienceForToken(props.selectedTokenId) ??
    (enterpriseTokens.value.length || !personalTokens.value.length ? 'enterprise' : 'personal')
  )
}

function audienceForToken(tokenId: string | null | undefined): RunnerTokenAudience | null {
  const token = props.tokens.find((candidate) => candidate.tokenId === tokenId)
  if (!token) return null
  return token.scope === 'user' ? 'personal' : 'enterprise'
}

function selectAudience(value: string): void {
  if (value !== 'enterprise' && value !== 'personal') return
  if (value === activeAudience.value) return
  activeAudience.value = value
  const tokens = value === 'enterprise' ? enterpriseTokens.value : personalTokens.value
  const selected =
    tokens.find(
      (token) => token.tokenId === props.selectedTokenId && !token.revokedAt && token.secret,
    ) ?? tokens.find((token) => !token.revokedAt && token.secret)
  if (selected) emit('selectToken', selected.tokenId)
}
</script>

<template>
  <section class="mt-12" aria-labelledby="cloud-runner-tokens-title">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase text-subtle">
          {{ t('profile.runnerTokens.eyebrow') }}
        </p>
        <h2 id="cloud-runner-tokens-title" class="mt-1 text-lg font-semibold text-fg">
          {{ t('profile.runnerTokens.title') }}
        </h2>
        <p class="mt-1 max-w-2xl text-sm leading-5 text-dim">
          {{ t('profile.runnerTokens.description') }}
        </p>
      </div>
      <TeaIconButton
        size="small"
        :icon="loading ? 'i-mdi-loading animate-spin' : 'i-mdi-refresh'"
        :label="t('profile.runnerTokens.refresh')"
        :tooltip="t('profile.runnerTokens.refresh')"
        :disabled="loading || offline"
        @click="emit('refresh')"
      />
    </header>

    <div v-if="offline" class="mt-4 rounded-card bg-muted px-5 py-5 text-sm text-dim">
      {{ t('profile.runnerTokens.offline') }}
    </div>
    <div
      v-else-if="error"
      class="mt-4 rounded-card bg-danger-subtle px-5 py-5 text-sm text-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <div
      v-else-if="loading && !tokens.length"
      class="mt-4 rounded-card bg-muted px-5 py-5 text-sm text-dim"
    >
      {{ t('profile.runnerTokens.loading') }}
    </div>
    <div v-else class="mt-4 rounded-card bg-muted px-5 py-5 sm:px-6">
      <p v-if="!tokens.length" class="text-sm text-dim">
        {{ t('profile.runnerTokens.empty') }}
      </p>
      <TeaTabs
        v-else
        :model-value="activeAudience"
        :tabs="audienceTabs"
        :label="t('profile.runnerTokens.audience.label')"
        @update:model-value="selectAudience"
      >
        <template #enterprise>
          <RunnerTokenAudiencePanel
            audience="enterprise"
            :tokens="enterpriseTokens"
            :selected-token-id="selectedTokenId"
            :command="command"
            :loading="loading"
            :command-loading="commandLoading"
            :command-error="commandError"
            :offline="offline"
            @select-token="emit('selectToken', $event)"
          />
        </template>
        <template #personal>
          <RunnerTokenAudiencePanel
            audience="personal"
            :tokens="personalTokens"
            :selected-token-id="selectedTokenId"
            :command="command"
            :loading="loading"
            :command-loading="commandLoading"
            :command-error="commandError"
            :offline="offline"
            @select-token="emit('selectToken', $event)"
            @reset-personal="emit('resetPersonal')"
          />
        </template>
      </TeaTabs>
    </div>
  </section>
</template>
