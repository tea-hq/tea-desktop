<script setup lang="ts">
import { TeaButton, TeaIconButton, TeaSelect } from '@/shared/ui'
import { useI18n } from 'vue-i18n'

import type { RuntimeDescriptor } from '@/features/conversation/contracts'
import type { LocalePreference } from '../contracts'

defineProps<{
  localePreference: LocalePreference
  defaultRuntimeId: string
  runtimes: RuntimeDescriptor[]
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  updateLocale: [locale: LocalePreference]
  updateDefaultRuntime: [runtimeId: string]
}>()

const { t } = useI18n()
const localeOptions: Array<{ value: LocalePreference; labelKey: string }> = [
  { value: 'system', labelKey: 'settings.language.system' },
  { value: 'en', labelKey: 'settings.language.english' },
  { value: 'zh-CN', labelKey: 'settings.language.chinese' },
]
const runtimeOptions = (runtimes: RuntimeDescriptor[]) =>
  runtimes.map((runtime) => ({
    value: runtime.id,
    label: `${runtime.displayName} · ${t(`composer.status.${runtime.status}`)}`,
    disabled: runtime.status !== 'ready',
  }))
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas">
    <div class="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:px-8">
      <div class="flex items-start justify-between gap-6">
        <div>
          <h1 class="text-2xl font-semibold text-fg">{{ t('settings.title') }}</h1>
          <p class="mt-1.5 text-base leading-5 text-dim">{{ t('settings.description') }}</p>
        </div>
        <TeaIconButton :label="t('settings.close')" icon="i-mdi-close" @click="emit('close')" />
      </div>

      <div
        v-if="error"
        class="mt-6 rounded-card bg-danger-subtle px-4 py-3 text-sm leading-5 text-danger"
        role="status"
      >
        {{ t(error) }}
      </div>

      <section class="mt-12">
        <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] sm:items-center">
          <div>
            <h2 class="text-base font-semibold text-fg">
              {{ t('settings.language.title') }}
            </h2>
            <p class="mt-1 text-sm leading-5 text-dim">
              {{ t('settings.language.description') }}
            </p>
          </div>
          <div class="grid grid-cols-3 gap-1 rounded-pill bg-panel p-1" role="group">
            <TeaButton
              v-for="option in localeOptions"
              :key="option.value"
              appearance="ghost"
              class="min-w-0 px-2"
              :class="
                localePreference === option.value
                  ? 'bg-canvas text-fg'
                  : 'text-dim hover:bg-pressed'
              "
              :aria-pressed="localePreference === option.value"
              @click="emit('updateLocale', option.value)"
            >
              {{ t(option.labelKey) }}
            </TeaButton>
          </div>
        </div>
      </section>

      <section class="mt-12">
        <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] sm:items-center">
          <div>
            <h2 class="text-base font-semibold text-fg">
              {{ t('settings.defaultAgent.title') }}
            </h2>
            <p class="mt-1 text-sm leading-5 text-dim">
              {{ t('settings.defaultAgent.description') }}
            </p>
          </div>
          <TeaSelect
            :model-value="defaultRuntimeId"
            :options="runtimeOptions(runtimes)"
            :label="t('settings.defaultAgent.title')"
            :disabled="saving || runtimes.every((runtime) => runtime.status !== 'ready')"
            @update:model-value="$event && emit('updateDefaultRuntime', String($event))"
          />
        </div>
      </section>

      <p
        v-if="saving"
        class="mt-4 flex items-center justify-end gap-2 text-sm text-subtle"
        role="status"
      >
        <span class="i-mdi-loading size-3.5 animate-spin" aria-hidden="true" />
        {{ t('settings.saving') }}
      </p>
    </div>
  </section>
</template>
