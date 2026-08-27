<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ChannelSelfProfile } from '@/features/channels/contracts'
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
}>()

const emit = defineEmits<{
  close: []
  retry: []
}>()

const { t } = useI18n()
const avatarFailed = ref(false)
const initials = computed(() => Array.from(props.centerProfile.displayName || props.centerProfile.preferredUsername || 'T')
  .slice(0, 2).join('').toLocaleUpperCase())

const alignmentIcon = computed(() => ({
  aligned: 'i-mdi-check-circle-outline',
  mismatched: 'i-mdi-alert-circle-outline',
  unknown: 'i-mdi-help-circle-outline',
})[props.alignment])

const alignmentClass = computed(() => ({
  aligned: 'bg-green-50 tea-fg-success',
  mismatched: 'tea-bg-danger-subtle tea-fg-danger',
  unknown: 'tea-bg-hover tea-fg-muted',
})[props.alignment])

const comparisonStatusClass: Record<ProfileComparison['status'], string> = {
  aligned: 'bg-green-50 tea-fg-success',
  mismatched: 'tea-bg-danger-subtle tea-fg-danger',
  notAvailable: 'tea-bg-muted tea-fg-muted',
}

watch(() => props.centerProfile.avatarUrl, () => { avatarFailed.value = false })

function displayValue(value: string | undefined): string {
  return value || t('profile.notProvided')
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col overflow-y-auto tea-bg-canvas">
    <div class="mx-auto w-full max-w-[1040px] px-6 pb-16 pt-8 sm:px-10 sm:pt-10">
      <header class="flex items-start justify-between gap-6">
        <div class="min-w-0">
          <p class="tea-text-caption tea-weight-strong uppercase tea-fg-subtle">{{ t('profile.eyebrow') }}</p>
          <h1 class="mt-2 tea-text-heading tea-weight-strong tea-fg">{{ t('profile.title') }}</h1>
          <p class="mt-1.5 max-w-2xl tea-text-body leading-6 tea-fg-muted">{{ t('profile.description') }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <TeaButton
            class="inline-flex size-8 items-center justify-center tea-radius-control tea-fg-subtle transition-colors tea-hover-bg tea-hover-fg tea-focus-ring tea-focus-ring tea-focus-ring disabled:cursor-wait disabled:opacity-50"
            :title="t('profile.refresh')"
            :aria-label="t('profile.refresh')"
            :disabled="phase === 'loading'"
            @click="emit('retry')"
          >
            <span :class="phase === 'loading' ? 'i-mdi-loading animate-spin' : 'i-mdi-refresh'" class="size-4.5" aria-hidden="true" />
          </TeaButton>
          <TeaButton
            data-testid="profile-close"
            class="inline-flex size-8 items-center justify-center tea-radius-control tea-fg-subtle transition-colors tea-hover-bg tea-hover-fg tea-focus-ring tea-focus-ring tea-focus-ring"
            :title="t('profile.close')"
            :aria-label="t('profile.close')"
            @click="emit('close')"
          >
            <span class="i-mdi-close size-4.5" aria-hidden="true" />
          </TeaButton>
        </div>
      </header>

      <section class="mt-8 flex flex-col gap-5 tea-bg-subtle px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div class="flex min-w-0 items-center gap-4">
          <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden tea-radius-overlay tea-bg-inverse tea-text-title tea-weight-strong tea-fg-inverse">
            <img
              v-if="centerProfile.avatarUrl && !avatarFailed"
              :src="centerProfile.avatarUrl"
              :alt="centerProfile.displayName"
              class="size-full object-cover"
              referrerpolicy="no-referrer"
              @error="avatarFailed = true"
            />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="min-w-0">
            <p class="truncate tea-text-title tea-weight-strong tea-fg">{{ centerProfile.displayName }}</p>
            <p class="mt-1 truncate tea-text-body tea-fg-muted">
              {{ centerProfile.preferredUsername || centerProfile.email || t('profile.notProvided') }}
            </p>
            <p class="mt-1 flex min-w-0 items-center gap-1.5 tea-text-caption tea-fg-subtle">
              <span class="i-mdi-domain size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ tenantDisplayName }} · {{ tenantDomain }}</span>
            </p>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span v-if="offline" class="tea-radius-small tea-bg-hover px-2 py-1 tea-text-caption tea-weight-medium tea-fg-muted">
            {{ t('profile.offline') }}
          </span>
          <span
            data-testid="profile-alignment"
            class="inline-flex items-center gap-1.5 tea-radius-small px-2.5 py-1.5 tea-text-caption tea-weight-strong"
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
              <p class="tea-text-caption tea-weight-strong uppercase tea-fg-subtle">{{ t('profile.sources.identity') }}</p>
              <h2 id="center-profile-source" class="mt-1 tea-text-lead tea-weight-strong tea-fg">{{ t('profile.sources.center') }}</h2>
            </div>
            <span class="inline-flex items-center gap-1.5 tea-text-caption tea-weight-medium tea-fg-success">
              <span class="size-1.5 tea-radius-pill tea-bg-success" aria-hidden="true" />
              {{ t('profile.sources.authenticated') }}
            </span>
          </header>
          <dl class="mt-4 tea-bg-subtle px-5 py-1">
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.displayName') }}</dt>
              <dd class="mt-1 break-words tea-text-body tea-weight-medium tea-fg">{{ displayValue(centerProfile.displayName) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.preferredUsername') }}</dt>
              <dd class="mt-1 break-words tea-text-body tea-weight-medium tea-fg">{{ displayValue(centerProfile.preferredUsername) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.email') }}</dt>
              <dd class="mt-1 flex flex-wrap items-center gap-2 break-words tea-text-body tea-weight-medium tea-fg">
                <span>{{ displayValue(centerProfile.email) }}</span>
                <span
                  v-if="centerProfile.email"
                  data-testid="profile-email-verification"
                  class="inline-flex items-center gap-1 tea-radius-small px-1.5 py-0.5 tea-text-micro tea-weight-strong"
                  :class="centerProfile.emailVerified ? 'tea-bg-success-subtle tea-fg-success' : 'tea-bg-hover tea-fg-muted'"
                >
                  <span :class="centerProfile.emailVerified ? 'i-mdi-check-circle-outline' : 'i-mdi-information-outline'" class="size-3" aria-hidden="true" />
                  {{ t(centerProfile.emailVerified ? 'profile.emailVerification.verified' : 'profile.emailVerification.notAsserted') }}
                </span>
              </dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.oidcSubject') }}</dt>
              <dd class="mt-1 break-all tea-mono tea-text-caption leading-5 tea-fg">{{ displayValue(centerProfile.oidcSubject) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.centerUserId') }}</dt>
              <dd class="mt-1 break-all tea-mono tea-text-caption leading-5 tea-fg">{{ displayValue(centerProfile.id) }}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="channel-profile-source">
          <header class="flex min-h-10 items-center justify-between gap-4">
            <div>
              <p class="tea-text-caption tea-weight-strong uppercase tea-fg-subtle">{{ t('profile.sources.messaging') }}</p>
              <h2 id="channel-profile-source" class="mt-1 tea-text-lead tea-weight-strong tea-fg">{{ providerName }}</h2>
            </div>
            <span v-if="phase === 'ready'" class="inline-flex items-center gap-1.5 tea-text-caption tea-weight-medium tea-fg-success">
              <span class="size-1.5 tea-radius-pill tea-bg-success" aria-hidden="true" />
              {{ t('profile.sources.live') }}
            </span>
          </header>

          <div v-if="phase === 'loading' || phase === 'idle'" data-testid="profile-loading" class="mt-4 flex min-h-[356px] items-center justify-center tea-bg-subtle px-8 text-center">
            <div>
              <span class="i-mdi-loading mx-auto block size-5 animate-spin tea-fg-subtle" aria-hidden="true" />
              <p class="mt-3 tea-text-body tea-weight-medium tea-fg">{{ t('profile.loading') }}</p>
              <p class="mt-1 tea-text-caption leading-5 tea-fg-subtle">{{ t('profile.loadingDescription', { provider: providerName }) }}</p>
            </div>
          </div>
          <div v-else-if="phase === 'unsupported' || phase === 'unavailable'" class="mt-4 flex min-h-[356px] items-center justify-center tea-bg-subtle px-8 text-center">
            <div class="max-w-xs">
              <span class="i-mdi-cloud-alert-outline mx-auto block size-6 tea-fg-subtle" aria-hidden="true" />
              <p class="mt-3 tea-text-body tea-weight-medium tea-fg">{{ t('profile.unavailable') }}</p>
              <p class="mt-1 tea-text-caption leading-5 tea-fg-muted">{{ errorKey ? t(errorKey) : t('profile.errors.loadFailed') }}</p>
              <TeaButton
                data-testid="profile-retry"
                class="mt-5 inline-flex h-8 items-center gap-1.5 tea-radius-control tea-bg-inverse px-3 tea-text-caption tea-weight-strong tea-fg-inverse transition-colors tea-hover-bg-inverse tea-focus-ring tea-focus-ring tea-focus-ring"
                @click="emit('retry')"
              >
                <span class="i-mdi-refresh size-3.5" aria-hidden="true" />
                {{ t('profile.retry') }}
              </TeaButton>
            </div>
          </div>
          <dl v-else-if="channelProfile" class="mt-4 tea-bg-subtle px-5 py-1">
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.imAccount') }}</dt>
              <dd class="mt-1 break-all tea-mono tea-text-caption leading-5 tea-fg">{{ displayValue(channelProfile.accountId) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.displayName') }}</dt>
              <dd class="mt-1 break-words tea-text-body tea-weight-medium tea-fg">{{ displayValue(channelProfile.name) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.email') }}</dt>
              <dd class="mt-1 break-words tea-text-body tea-weight-medium tea-fg">{{ displayValue(channelProfile.email) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.fields.avatarUrl') }}</dt>
              <dd class="mt-1 break-all tea-mono tea-text-caption leading-5 tea-fg">{{ displayValue(channelProfile.avatarUrl) }}</dd>
            </div>
            <div class="py-4">
              <dt class="tea-text-caption tea-weight-medium tea-fg-subtle">{{ t('profile.sources.freshness') }}</dt>
              <dd class="mt-1 tea-text-body tea-weight-medium tea-fg">{{ t('profile.sources.cloudRefresh') }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section v-if="phase === 'ready'" class="mt-12" aria-labelledby="profile-comparison-title">
        <header>
          <p class="tea-text-caption tea-weight-strong uppercase tea-fg-subtle">{{ t('profile.comparison.eyebrow') }}</p>
          <h2 id="profile-comparison-title" class="mt-1 tea-text-lead tea-weight-strong tea-fg">{{ t('profile.comparison.title') }}</h2>
        </header>
        <div class="mt-4 tea-bg-subtle px-4 py-2 sm:px-5">
          <div
            v-for="comparison in comparisons"
            :key="comparison.field"
            class="grid min-h-20 items-center gap-3 py-3 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_110px]"
          >
            <p class="tea-text-caption tea-weight-strong tea-fg">{{ t(`profile.fields.${comparison.field}`) }}</p>
            <div class="min-w-0">
              <p class="tea-text-micro tea-weight-medium uppercase tea-fg-subtle">{{ t('profile.comparison.center') }}</p>
              <p class="mt-1 break-all tea-text-caption tea-fg" :class="comparison.field === 'avatarUrl' ? 'tea-mono tea-text-micro' : ''">
                {{ displayValue(comparison.centerValue) }}
              </p>
            </div>
            <div class="min-w-0">
              <p class="tea-text-micro tea-weight-medium uppercase tea-fg-subtle">{{ providerName }}</p>
              <p class="mt-1 break-all tea-text-caption tea-fg" :class="comparison.field === 'avatarUrl' ? 'tea-mono tea-text-micro' : ''">
                {{ displayValue(comparison.channelValue) }}
              </p>
            </div>
            <span
              :data-comparison-status="comparison.status"
              class="inline-flex w-fit items-center gap-1 tea-radius-small px-2 py-1 tea-text-caption tea-weight-strong"
              :class="comparisonStatusClass[comparison.status]"
            >
              <span :class="comparison.status === 'aligned' ? 'i-mdi-check' : comparison.status === 'mismatched' ? 'i-mdi-alert-outline' : 'i-mdi-minus'" class="size-3.5" aria-hidden="true" />
              {{ t(`profile.comparison.status.${comparison.status}`) }}
            </span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
