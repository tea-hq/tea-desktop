<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaIconButton } from '@/shared/ui'
import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../../packages/runner/src/protocol'
import RunnerRegistrationCommandTabs from './RunnerRegistrationCommandTabs.vue'

const props = defineProps<{
  audience: 'enterprise' | 'personal'
  tokens: RunnerTokenView[]
  selectedTokenId: string | null
  command: RunnerRegistrationCommand | null
  loading: boolean
  commandLoading: boolean
  commandError: string | null
  offline: boolean
}>()

const emit = defineEmits<{
  selectToken: [tokenId: string]
  resetPersonal: []
}>()

const { t } = useI18n()
const selectedToken = computed(() =>
  props.tokens.find((token) => token.tokenId === props.selectedTokenId),
)
const selectedCommand = computed(() =>
  props.command?.tokenId === selectedToken.value?.tokenId ? props.command : null,
)

function tokenLabel(token: RunnerTokenView): string {
  return t(`profile.runnerTokens.scope.${token.scope}`)
}

function canRegister(token: RunnerTokenView): boolean {
  return !token.revokedAt && Boolean(token.secret)
}
</script>

<template>
  <div>
    <p class="max-w-2xl text-sm leading-5 text-dim">
      {{ t(`profile.runnerTokens.audience.${audience}Description`) }}
    </p>

    <p v-if="!tokens.length" class="border-b border-line-soft py-5 text-sm text-dim">
      {{ t(`profile.runnerTokens.audience.${audience}Empty`) }}
    </p>

    <div v-else class="mt-3 border-y border-line-soft">
      <div
        v-for="token in tokens"
        :key="token.tokenId"
        class="flex flex-col gap-3 border-b border-line-soft py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
        :data-testid="`runner-token-${token.tokenId}`"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold text-fg">{{ tokenLabel(token) }}</p>
            <span class="rounded-structural bg-hover px-2 py-1 text-xs font-medium text-dim">
              {{ token.tokenId }}
            </span>
          </div>
          <p class="mt-1 break-all font-mono text-xs text-dim">{{ token.scopeId }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-1 sm:justify-end">
          <span
            v-if="selectedTokenId === token.tokenId"
            class="inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-medium text-fg"
          >
            <span class="i-mdi-check size-3.5" aria-hidden="true" />
            {{ t('profile.runnerTokens.selectedForRegistration') }}
          </span>
          <TeaButton
            v-else-if="canRegister(token)"
            appearance="ghost"
            size="small"
            :disabled="loading || commandLoading || offline"
            :aria-label="t('profile.runnerTokens.useTokenLabel', { tokenId: token.tokenId })"
            @click="emit('selectToken', token.tokenId)"
          >
            {{ t('profile.runnerTokens.useToken') }}
          </TeaButton>
          <span
            v-else
            class="inline-flex min-h-8 items-center px-2 text-xs font-medium text-subtle"
          >
            {{ t('profile.runnerTokens.unavailableToken') }}
          </span>
          <TeaIconButton
            v-if="token.scope === 'user'"
            size="small"
            :label="t('profile.runnerTokens.resetPersonal')"
            :tooltip="t('profile.runnerTokens.resetPersonal')"
            :disabled="loading || commandLoading || offline"
            icon="i-mdi-key-refresh-outline"
            @click="emit('resetPersonal')"
          />
        </div>
      </div>
    </div>

    <div v-if="tokens.length" class="pt-5">
      <p class="text-sm font-semibold text-fg">{{ t('profile.runnerTokens.commandTitle') }}</p>
      <p class="mt-1 text-sm leading-5 text-dim">
        {{ t('profile.runnerTokens.commandDescription') }}
      </p>
      <RunnerRegistrationCommandTabs
        v-if="selectedCommand && selectedToken"
        class="mt-4"
        :registration="selectedCommand"
        :token="selectedToken"
      />
      <p v-else-if="commandLoading" class="mt-4 text-sm leading-5 text-dim">
        {{ t('profile.runnerTokens.commandLoading') }}
      </p>
      <p v-else-if="commandError" class="mt-4 text-sm leading-5 text-danger" role="alert">
        {{ commandError }}
      </p>
      <p v-else class="mt-4 text-sm leading-5 text-dim">
        {{ t('profile.runnerTokens.selectToken') }}
      </p>
    </div>
  </div>
</template>
