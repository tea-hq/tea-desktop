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
  <main class="flex min-h-screen flex-col bg-canvas text-fg">
    <header class="flex h-16 shrink-0 items-center px-6 sm:px-10">
      <div class="flex items-center gap-3">
        <span
          class="flex size-8 items-center justify-center rounded-full bg-inverse font-display text-base font-semibold text-canvas"
          >T</span
        >
        <span class="font-display text-xl font-semibold">{{ t('app.name') }}</span>
      </div>
    </header>

    <section class="flex flex-1 items-center justify-center px-6 pb-20 pt-8">
      <form class="w-full max-w-[460px]" @submit.prevent="emit('submit')">
        <p class="text-sm font-semibold uppercase text-subtle">
          {{ t('auth.enterprise.eyebrow') }}
        </p>
        <h1 class="mt-3 text-4xl font-semibold leading-tight text-fg">
          {{ t('auth.enterprise.title') }}
        </h1>
        <p class="mt-4 max-w-md text-base leading-6 text-dim">
          {{ t('auth.enterprise.description') }}
        </p>

        <label class="mt-10 block">
          <span class="text-base font-semibold text-fg">{{
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
          class="mt-3 bg-danger-subtle px-4 py-3 text-base text-danger"
          role="alert"
        >
          {{ t(`auth.errors.${errorCode}`) }}
        </p>
        <LoginProgress v-if="pending" class="mt-4" :phase="phase" />

        <div class="mt-6 flex gap-3">
          <TeaButton
            v-if="pending"
            appearance="secondary"
            size="primary"
            class="flex-1"
            type="button"
            @click="emit('cancel')"
          >
            <span class="i-mdi-close size-4" aria-hidden="true" />
            <span>{{ t('auth.enterprise.cancel') }}</span>
          </TeaButton>
          <TeaButton
            v-else
            appearance="primary"
            size="primary"
            class="flex-1"
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
