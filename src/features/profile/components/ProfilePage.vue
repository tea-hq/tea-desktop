<script setup lang="ts">
import { createDefaultAvatarDataUri } from '@/shared/avatar/defaultAvatar'
import { TeaAvatar, TeaButton } from '@/shared/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ChannelSelfProfile } from '@/features/channels/contracts'
import type {
  RunnerRegistrationCommand,
  RunnerTokenView,
} from '../../../../packages/runner/src/protocol'
import CloudRunnerTokenPanel from './CloudRunnerTokenPanel.vue'
import type {
  CenterSelfProfile,
  ProfileAlignment,
  ProfileComparison,
  ProfilePhase,
} from '../contracts'

const props = defineProps<{
  tenantDisplayName: string
  tenantDomain: string
  centerProfile: CenterSelfProfile
  channelProfile: ChannelSelfProfile | null
  providerName: string
  phase: ProfilePhase
  alignment: ProfileAlignment
  comparisons: ProfileComparison[]
  errorKey: string | null
  offline: boolean
  runnerTokens?: RunnerTokenView[]
  runnerRegistrationTokenId?: string | null
  runnerRegistrationCommand?: RunnerRegistrationCommand | null
  runnerTokensLoading?: boolean
  runnerTokensError?: string | null
  runnerRegistrationCommandLoading?: boolean
  runnerRegistrationCommandError?: string | null
}>()

const emit = defineEmits<{
  close: []
  retry: []
  refreshRunnerTokens: []
  selectRunnerToken: [tokenId: string]
  resetPersonalRunnerToken: []
}>()

const { t } = useI18n()
const initials = computed(() =>
  Array.from(props.centerProfile.displayName || props.centerProfile.preferredUsername || 'T')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase(),
)
const generatedAvatarUrl = computed(() =>
  props.channelProfile?.accountId?.trim()
    ? createDefaultAvatarDataUri(`tea:account:${props.channelProfile.accountId}`)
    : '',
)

const alignmentIcon = computed(
  () =>
    ({
      aligned: 'i-mdi-check-circle-outline',
      mismatched: 'i-mdi-alert-circle-outline',
      unknown: 'i-mdi-help-circle-outline',
    })[props.alignment],
)

const alignmentClass = computed(
  () =>
    ({
      aligned: 'bg-success-subtle text-success',
      mismatched: 'bg-danger-subtle text-danger',
      unknown: 'bg-hover text-dim',
    })[props.alignment],
)

const comparisonStatusClass: Record<ProfileComparison['status'], string> = {
  aligned: 'bg-success-subtle text-success',
  mismatched: 'bg-danger-subtle text-danger',
  notAvailable: 'bg-panel text-dim',
}

function displayValue(value: string | undefined): string {
  return value || t('profile.notProvided')
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col overflow-y-auto bg-canvas">
    <div class="mx-auto w-full max-w-[1040px] px-6 pb-16 pt-8 sm:px-10 sm:pt-10">
      <header class="flex items-start justify-between gap-6">
        <div class="min-w-0">
          <p class="text-sm font-semibold uppercase text-subtle">
            {{ t('profile.eyebrow') }}
          </p>
          <h1 class="mt-2 text-2xl font-semibold text-fg">{{ t('profile.title') }}</h1>
          <p class="mt-1.5 max-w-2xl text-base leading-6 text-dim">
            {{ t('profile.description') }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <TeaButton
            class="inline-flex size-8 items-center justify-center rounded-full text-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
            :title="t('profile.refresh')"
            :aria-label="t('profile.refresh')"
            :disabled="phase === 'loading'"
            @click="emit('retry')"
          >
            <span
              :class="phase === 'loading' ? 'i-mdi-loading animate-spin' : 'i-mdi-refresh'"
              class="size-4.5"
              aria-hidden="true"
            />
          </TeaButton>
          <TeaButton
            data-testid="profile-close"
            class="inline-flex size-8 items-center justify-center rounded-full text-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :title="t('profile.close')"
            :aria-label="t('profile.close')"
            @click="emit('close')"
          >
            <span class="i-mdi-close size-4.5" aria-hidden="true" />
          </TeaButton>
        </div>
      </header>

      <section
        class="mt-8 flex flex-col gap-5 rounded-card bg-muted px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-4">
          <TeaAvatar
            size="large"
            :src="channelProfile?.avatarUrl || centerProfile.avatarUrl"
            :fallback-src="generatedAvatarUrl"
            :fallback-text="initials"
            fallback-class="bg-inverse text-on-inverse"
          />
          <div class="min-w-0">
            <p class="truncate text-xl font-semibold text-fg">
              {{ centerProfile.displayName }}
            </p>
            <p class="mt-1 truncate text-base text-dim">
              {{
                centerProfile.preferredUsername || centerProfile.email || t('profile.notProvided')
              }}
            </p>
            <p class="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-subtle">
              <span class="i-mdi-domain size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ tenantDisplayName }} · {{ tenantDomain }}</span>
            </p>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span
            v-if="offline"
            class="rounded-structural bg-hover px-2 py-1 text-sm font-medium text-dim"
          >
            {{ t('profile.offline') }}
          </span>
          <span
            data-testid="profile-alignment"
            class="inline-flex items-center gap-1.5 rounded-structural px-2.5 py-1.5 text-sm font-semibold"
            :class="alignmentClass"
          >
            <span :class="alignmentIcon" class="size-4" aria-hidden="true" />
            {{ t(`profile.alignment.${alignment}`) }}
          </span>
        </div>
      </section>

      <div class="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="center-profile-source">
          <header class="flex min-h-10 items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold uppercase text-subtle">
                {{ t('profile.sources.identity') }}
              </p>
              <h2 id="center-profile-source" class="mt-1 text-lg font-semibold text-fg">
                {{ t('profile.sources.center') }}
              </h2>
            </div>
            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {{ t('profile.sources.authenticated') }}
            </span>
          </header>
          <dl class="mt-4 rounded-card bg-muted px-5 py-1">
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.displayName') }}
              </dt>
              <dd class="mt-1 break-words text-base font-medium text-fg">
                {{ displayValue(centerProfile.displayName) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.preferredUsername') }}
              </dt>
              <dd class="mt-1 break-words text-base font-medium text-fg">
                {{ displayValue(centerProfile.preferredUsername) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.email') }}
              </dt>
              <dd
                class="mt-1 flex flex-wrap items-center gap-2 break-words text-base font-medium text-fg"
              >
                <span>{{ displayValue(centerProfile.email) }}</span>
                <span
                  v-if="centerProfile.email"
                  data-testid="profile-email-verification"
                  class="inline-flex items-center gap-1 rounded-structural px-1.5 py-0.5 text-xs font-semibold"
                  :class="
                    centerProfile.emailVerified
                      ? 'bg-success-subtle text-success'
                      : 'bg-hover text-dim'
                  "
                >
                  <span
                    :class="
                      centerProfile.emailVerified
                        ? 'i-mdi-check-circle-outline'
                        : 'i-mdi-information-outline'
                    "
                    class="size-3"
                    aria-hidden="true"
                  />
                  {{
                    t(
                      centerProfile.emailVerified
                        ? 'profile.emailVerification.verified'
                        : 'profile.emailVerification.notAsserted',
                    )
                  }}
                </span>
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.oidcSubject') }}
              </dt>
              <dd class="mt-1 break-all font-mono text-sm leading-5 text-fg">
                {{ displayValue(centerProfile.oidcSubject) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.centerUserId') }}
              </dt>
              <dd class="mt-1 break-all font-mono text-sm leading-5 text-fg">
                {{ displayValue(centerProfile.id) }}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="channel-profile-source">
          <header class="flex min-h-10 items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold uppercase text-subtle">
                {{ t('profile.sources.messaging') }}
              </p>
              <h2 id="channel-profile-source" class="mt-1 text-lg font-semibold text-fg">
                {{ providerName }}
              </h2>
            </div>
            <span
              v-if="phase === 'ready'"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-success"
            >
              <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {{ t('profile.sources.live') }}
            </span>
          </header>

          <div
            v-if="phase === 'loading' || phase === 'idle'"
            data-testid="profile-loading"
            class="mt-4 flex min-h-[356px] items-center justify-center rounded-card bg-muted px-8 text-center"
          >
            <div>
              <span
                class="i-mdi-loading mx-auto block size-5 animate-spin text-subtle"
                aria-hidden="true"
              />
              <p class="mt-3 text-base font-medium text-fg">{{ t('profile.loading') }}</p>
              <p class="mt-1 text-sm leading-5 text-subtle">
                {{ t('profile.loadingDescription', { provider: providerName }) }}
              </p>
            </div>
          </div>
          <div
            v-else-if="phase === 'unsupported' || phase === 'unavailable'"
            class="mt-4 flex min-h-[356px] items-center justify-center rounded-card bg-muted px-8 text-center"
          >
            <div class="max-w-xs">
              <span
                class="i-mdi-cloud-alert-outline mx-auto block size-6 text-subtle"
                aria-hidden="true"
              />
              <p class="mt-3 text-base font-medium text-fg">
                {{ t('profile.unavailable') }}
              </p>
              <p class="mt-1 text-sm leading-5 text-dim">
                {{ errorKey ? t(errorKey) : t('profile.errors.loadFailed') }}
              </p>
              <TeaButton
                data-testid="profile-retry"
                appearance="primary"
                class="mt-5 inline-flex items-center gap-1.5 px-3 text-sm"
                @click="emit('retry')"
              >
                <span class="i-mdi-refresh size-3.5" aria-hidden="true" />
                {{ t('profile.retry') }}
              </TeaButton>
            </div>
          </div>
          <dl v-else-if="channelProfile" class="mt-4 rounded-card bg-muted px-5 py-1">
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.imAccount') }}
              </dt>
              <dd class="mt-1 break-all font-mono text-sm leading-5 text-fg">
                {{ displayValue(channelProfile.accountId) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.displayName') }}
              </dt>
              <dd class="mt-1 break-words text-base font-medium text-fg">
                {{ displayValue(channelProfile.name) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.email') }}
              </dt>
              <dd class="mt-1 break-words text-base font-medium text-fg">
                {{ displayValue(channelProfile.email) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.fields.avatarUrl') }}
              </dt>
              <dd class="mt-1 break-all font-mono text-sm leading-5 text-fg">
                {{ displayValue(channelProfile.avatarUrl) }}
              </dd>
            </div>
            <div class="py-4">
              <dt class="text-sm font-medium text-subtle">
                {{ t('profile.sources.freshness') }}
              </dt>
              <dd class="mt-1 text-base font-medium text-fg">
                {{ t('profile.sources.cloudRefresh') }}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section v-if="phase === 'ready'" class="mt-12" aria-labelledby="profile-comparison-title">
        <header>
          <p class="text-sm font-semibold uppercase text-subtle">
            {{ t('profile.comparison.eyebrow') }}
          </p>
          <h2 id="profile-comparison-title" class="mt-1 text-lg font-semibold text-fg">
            {{ t('profile.comparison.title') }}
          </h2>
        </header>
        <div class="mt-4 rounded-card bg-muted px-4 py-2 sm:px-5">
          <div
            v-for="comparison in comparisons"
            :key="comparison.field"
            class="grid min-h-20 items-center gap-3 py-3 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_110px]"
          >
            <p class="text-sm font-semibold text-fg">
              {{ t(`profile.fields.${comparison.field}`) }}
            </p>
            <div class="min-w-0">
              <p class="text-xs font-medium uppercase text-subtle">
                {{ t('profile.comparison.center') }}
              </p>
              <p
                class="mt-1 break-all text-sm text-fg"
                :class="comparison.field === 'avatarUrl' ? 'font-mono text-xs' : ''"
              >
                {{ displayValue(comparison.centerValue) }}
              </p>
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium uppercase text-subtle">
                {{ providerName }}
              </p>
              <p
                class="mt-1 break-all text-sm text-fg"
                :class="comparison.field === 'avatarUrl' ? 'font-mono text-xs' : ''"
              >
                {{ displayValue(comparison.channelValue) }}
              </p>
            </div>
            <span
              :data-comparison-status="comparison.status"
              class="inline-flex w-fit items-center gap-1 rounded-structural px-2 py-1 text-sm font-semibold"
              :class="comparisonStatusClass[comparison.status]"
            >
              <span
                :class="
                  comparison.status === 'aligned'
                    ? 'i-mdi-check'
                    : comparison.status === 'mismatched'
                      ? 'i-mdi-alert-outline'
                      : 'i-mdi-minus'
                "
                class="size-3.5"
                aria-hidden="true"
              />
              {{ t(`profile.comparison.status.${comparison.status}`) }}
            </span>
          </div>
        </div>
      </section>

      <CloudRunnerTokenPanel
        :tokens="runnerTokens"
        :selected-token-id="runnerRegistrationTokenId"
        :command="runnerRegistrationCommand"
        :loading="runnerTokensLoading"
        :error="runnerTokensError"
        :command-loading="runnerRegistrationCommandLoading"
        :command-error="runnerRegistrationCommandError"
        :offline="offline"
        @refresh="emit('refreshRunnerTokens')"
        @select-token="emit('selectRunnerToken', $event)"
        @reset-personal="emit('resetPersonalRunnerToken')"
      />
    </div>
  </main>
</template>
