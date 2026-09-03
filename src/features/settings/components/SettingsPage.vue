<script setup lang="ts">
import { computed } from 'vue'
import { SegmentedChoice, TeaCheckbox, TeaIconButton, TeaMenuSelect } from '@/shared/ui'
import { useI18n } from 'vue-i18n'

import type { ModelOption, RuntimeDescriptor } from '@/features/conversation/contracts'
import type {
  LocalePreference,
  NotificationPreviewPreference,
  NotificationSettings,
  ThemePreference,
} from '../contracts'

const props = defineProps<{
  localePreference: LocalePreference
  themePreference: ThemePreference
  notificationSettings: NotificationSettings
  defaultRuntimeId: string
  defaultModel: string | null
  runtimes: RuntimeDescriptor[]
  modelOptions: ModelOption[]
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  updateLocale: [locale: LocalePreference]
  updateTheme: [theme: ThemePreference]
  updateNotificationsEnabled: [enabled: boolean]
  updateNotificationSound: [sound: boolean]
  updateNotificationPreview: [preview: NotificationPreviewPreference]
  updateDefaultRuntime: [runtimeId: string]
  updateDefaultModel: [model: string]
}>()

const { t } = useI18n()
const localeOptions = computed(() => [
  { value: 'system', label: t('settings.language.system'), disabled: props.saving },
  { value: 'en', label: t('settings.language.english'), disabled: props.saving },
  { value: 'zh-CN', label: t('settings.language.chinese'), disabled: props.saving },
])
const themeOptions = computed(() => [
  { value: 'system', label: t('settings.appearance.system'), disabled: props.saving },
  { value: 'light', label: t('settings.appearance.light'), disabled: props.saving },
  { value: 'dark', label: t('settings.appearance.dark'), disabled: props.saving },
])
const notificationPreviewOptions = computed(() => [
  {
    value: 'message',
    label: t('settings.notifications.preview.message'),
    disabled: props.saving || !props.notificationSettings.enabled,
  },
  {
    value: 'sender',
    label: t('settings.notifications.preview.sender'),
    disabled: props.saving || !props.notificationSettings.enabled,
  },
  {
    value: 'hidden',
    label: t('settings.notifications.preview.hidden'),
    disabled: props.saving || !props.notificationSettings.enabled,
  },
])
const runtimeOptions = (runtimes: RuntimeDescriptor[]) =>
  runtimes.map((runtime) => ({
    value: runtime.id,
    label: `${runtime.displayName} · ${t(`composer.status.${runtime.status}`)}`,
    disabled: runtime.status !== 'ready',
  }))
const modelOptions = computed(() =>
  props.modelOptions.map((option) => ({
    value: option.value,
    label: option.label ?? (option.labelKey ? t(option.labelKey) : option.value),
    disabled: option.unavailable,
  })),
)
const effectiveDefaultModel = computed(
  () =>
    modelOptions.value.find((option) => option.value === props.defaultModel && !option.disabled)
      ?.value ??
    modelOptions.value.find((option) => !option.disabled)?.value ??
    null,
)
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
          <SegmentedChoice
            class="settings-segmented w-full"
            :model-value="localePreference"
            :options="localeOptions"
            :label="t('settings.language.title')"
            @update:model-value="emit('updateLocale', $event as LocalePreference)"
          />
        </div>
      </section>

      <section class="mt-12">
        <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] sm:items-center">
          <div>
            <h2 class="text-base font-semibold text-fg">
              {{ t('settings.appearance.title') }}
            </h2>
            <p class="mt-1 text-sm leading-5 text-dim">
              {{ t('settings.appearance.description') }}
            </p>
          </div>
          <SegmentedChoice
            class="settings-segmented w-full"
            :model-value="themePreference"
            :options="themeOptions"
            :label="t('settings.appearance.title')"
            @update:model-value="emit('updateTheme', $event as ThemePreference)"
          />
        </div>
      </section>

      <section class="mt-12">
        <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] sm:items-start">
          <div>
            <h2 class="text-base font-semibold text-fg">
              {{ t('settings.notifications.title') }}
            </h2>
            <p class="mt-1 text-sm leading-5 text-dim">
              {{ t('settings.notifications.description') }}
            </p>
          </div>
          <div class="space-y-4">
            <TeaCheckbox
              class="w-full"
              :model-value="notificationSettings.enabled"
              :label="t('settings.notifications.enabled')"
              :disabled="saving"
              @update:model-value="emit('updateNotificationsEnabled', $event)"
            >
              <span class="min-w-0">{{ t('settings.notifications.enabled') }}</span>
            </TeaCheckbox>
            <TeaCheckbox
              class="w-full"
              :model-value="notificationSettings.sound"
              :label="t('settings.notifications.sound')"
              :disabled="saving || !notificationSettings.enabled"
              @update:model-value="emit('updateNotificationSound', $event)"
            >
              <span class="min-w-0">{{ t('settings.notifications.sound') }}</span>
            </TeaCheckbox>
            <div class="min-w-0">
              <p class="mb-2 text-sm font-medium text-fg">
                {{ t('settings.notifications.preview.title') }}
              </p>
              <SegmentedChoice
                class="settings-segmented w-full"
                :model-value="notificationSettings.preview"
                :options="notificationPreviewOptions"
                :label="t('settings.notifications.preview.title')"
                @update:model-value="
                  emit('updateNotificationPreview', $event as NotificationPreviewPreference)
                "
              />
            </div>
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
          <TeaMenuSelect
            :model-value="defaultRuntimeId"
            :options="runtimeOptions(runtimes)"
            :label="t('settings.defaultAgent.title')"
            appearance="field"
            class="settings-menu-select"
            :disabled="saving || runtimes.every((runtime) => runtime.status !== 'ready')"
            @update:model-value="$event && emit('updateDefaultRuntime', String($event))"
          />
        </div>
      </section>

      <section class="mt-12">
        <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] sm:items-center">
          <div>
            <h2 class="text-base font-semibold text-fg">
              {{ t('settings.defaultModel.title') }}
            </h2>
            <p class="mt-1 text-sm leading-5 text-dim">
              {{ t('settings.defaultModel.description') }}
            </p>
          </div>
          <TeaMenuSelect
            :model-value="effectiveDefaultModel"
            :options="modelOptions"
            :label="t('settings.defaultModel.title')"
            appearance="field"
            class="settings-menu-select"
            :disabled="saving || modelOptions.every((option) => option.disabled)"
            @update:model-value="$event && emit('updateDefaultModel', String($event))"
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

<style scoped>
.settings-segmented {
  width: 100%;
}

.settings-segmented :deep(.nav-pill-group__item) {
  flex: 1 1 0;
  min-width: 0;
}

.settings-menu-select {
  width: 100%;
}
</style>
