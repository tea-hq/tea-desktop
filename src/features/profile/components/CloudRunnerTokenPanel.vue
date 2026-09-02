<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaIconButton } from '@/shared/ui'
import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../../packages/runner/src/protocol'

const props = withDefaults(
  defineProps<{
    tokens?: RunnerTokenView[]
    command?: RunnerRegistrationCommand | null
    loading?: boolean
    error?: string | null
    offline?: boolean
  }>(),
  { tokens: () => [], command: null, loading: false, error: null, offline: false },
)

const emit = defineEmits<{
  refresh: []
  resetPersonal: []
}>()

const { t } = useI18n()
const copied = ref(false)

function tokenLabel(token: RunnerTokenView): string {
  return t(`profile.runnerTokens.scope.${token.scope}`)
}

async function copyCommand(): Promise<void> {
  if (!props.command?.command) return
  await navigator.clipboard.writeText(props.command.command)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1500)
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
    <div v-else class="mt-4 rounded-card bg-muted px-5 sm:px-6">
      <div v-if="!tokens.length" class="py-5 text-sm text-dim">
        {{ t('profile.runnerTokens.empty') }}
      </div>
      <template v-else>
        <div class="py-1">
          <div
            v-for="token in tokens"
            :key="token.tokenId"
            class="border-b border-line-soft py-4 last:border-b-0"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-fg">{{ tokenLabel(token) }}</p>
                <p class="mt-1 break-all font-mono text-xs text-dim">{{ token.scopeId }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <span class="rounded-structural bg-hover px-2 py-1 text-xs font-medium text-dim">
                  {{ token.tokenId }}
                </span>
                <TeaIconButton
                  v-if="token.scope === 'user'"
                  size="small"
                  :label="t('profile.runnerTokens.resetPersonal')"
                  :tooltip="t('profile.runnerTokens.resetPersonal')"
                  :disabled="loading || offline"
                  icon="i-mdi-key-refresh-outline"
                  @click="emit('resetPersonal')"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-line-soft py-5">
          <p class="text-sm font-semibold text-fg">{{ t('profile.runnerTokens.commandTitle') }}</p>
          <p class="mt-1 text-sm leading-5 text-dim">
            {{ t('profile.runnerTokens.commandDescription') }}
          </p>
          <div v-if="command" class="mt-4">
            <div class="relative rounded-structural bg-canvas">
              <pre
                class="max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 pr-14 font-mono text-xs leading-5 text-fg"
                >{{ command.command }}</pre>
              <TeaIconButton
                class="absolute right-2 top-2"
                size="small"
                appearance="primary"
                :label="copied ? t('common.copied') : t('common.copy')"
                :tooltip="copied ? t('common.copied') : t('common.copy')"
                :icon="copied ? 'i-mdi-check' : 'i-mdi-content-copy'"
                @click="copyCommand"
              />
            </div>
          </div>
          <p v-else-if="loading" class="mt-4 text-sm leading-5 text-dim">
            {{ t('profile.runnerTokens.commandLoading') }}
          </p>
          <p v-else class="mt-4 text-sm leading-5 text-dim">
            {{ t('profile.runnerTokens.selectToken') }}
          </p>
        </div>
      </template>
    </div>
  </section>
</template>
