<script setup lang="ts">
import { TeaButton, TeaInput } from '@/shared/ui'
import { useI18n } from 'vue-i18n'
import LoginProgress from './LoginProgress.vue'
import type { CenterAuthPhase } from '../contracts'

defineProps<{
  domain: string
  phase: CenterAuthPhase
  pending: boolean
  errorCode: string | null
}>()
const emit = defineEmits<{ 'update:domain': [value: string]; submit: []; cancel: [] }>()
const { t } = useI18n()
</script>

<template>
  <main class="flex min-h-screen flex-col tea-bg-canvas tea-fg">
    <header class="flex h-16 shrink-0 items-center px-6 sm:px-10">
      <div class="flex items-center gap-3">
        <span
          class="flex size-8 items-center justify-center tea-radius-control tea-bg-inverse tea-font-ui tea-text-body tea-weight-strong tea-fg-inverse"
          >T</span
        >
        <span class="tea-font-ui tea-text-title tea-weight-strong">{{ t('app.name') }}</span>
      </div>
    </header>

    <section class="flex flex-1 items-center justify-center px-6 pb-20 pt-8">
      <form class="w-full max-w-[460px]" @submit.prevent="emit('submit')">
        <p class="tea-text-caption tea-weight-strong uppercase tea-fg-subtle">
          {{ t('auth.enterprise.eyebrow') }}
        </p>
        <h1 class="mt-3 tea-font-ui tea-text-display tea-weight-strong leading-tight tea-fg">
          {{ t('auth.enterprise.title') }}
        </h1>
        <p class="mt-4 max-w-md tea-text-body leading-6 tea-fg-muted">
          {{ t('auth.enterprise.description') }}
        </p>

        <label class="mt-10 block">
          <span class="tea-text-body tea-weight-strong tea-fg">{{
            t('auth.enterprise.domainLabel')
          }}</span>
          <span class="mt-2 block">
            <TeaInput
              type="text"
              autocomplete="organization"
              :model-value="domain"
              :label="t('auth.enterprise.domainLabel')"
              :disabled="pending"
              :placeholder="t('auth.enterprise.domainPlaceholder')"
              @update:model-value="emit('update:domain', $event)"
            />
          </span>
        </label>

        <p
          v-if="errorCode"
          class="mt-3 tea-bg-danger-subtle px-4 py-3 tea-text-body tea-fg-danger"
          role="alert"
        >
          {{ t(`auth.errors.${errorCode}`) }}
        </p>
        <LoginProgress v-if="pending" class="mt-4" :phase="phase" />

        <div class="mt-6 flex gap-3">
          <TeaButton
            v-if="pending"
            class="inline-flex h-11 flex-1 items-center justify-center gap-2 tea-radius-control tea-bg-muted px-5 tea-text-body tea-weight-strong tea-fg transition-colors tea-hover-bg-strong tea-focus-ring tea-focus-ring tea-focus-ring"
            type="button"
            @click="emit('cancel')"
          >
            <span class="i-mdi-close size-4" aria-hidden="true" />
            <span>{{ t('auth.enterprise.cancel') }}</span>
          </TeaButton>
          <TeaButton
            v-else
            class="inline-flex h-11 flex-1 items-center justify-center gap-2 tea-radius-control tea-bg-inverse px-5 tea-text-body tea-weight-strong tea-fg-inverse transition-colors tea-hover-bg-inverse tea-focus-ring tea-focus-ring tea-focus-ring disabled:cursor-not-allowed tea-disabled-bg"
            type="submit"
            :disabled="!domain.trim()"
          >
            <span>{{
              phase === 'recoveryRequired'
                ? t('auth.enterprise.signInAgain')
                : t('auth.enterprise.continue')
            }}</span>
            <span class="i-mdi-arrow-right size-4" aria-hidden="true" />
          </TeaButton>
        </div>
      </form>
    </section>
  </main>
</template>
