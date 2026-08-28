<script setup lang="ts">
import { TeaButton, TeaInput } from '@/shared/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCredentialsStore } from '../store'

const store = useCredentialsStore()
const { t } = useI18n()
const pluginId = ref('')
const connectionId = ref('')
const secret = ref('')
const selected = ref<string | null>(null)
const canSave = computed(
  () =>
    pluginId.value.trim().length > 0 &&
    connectionId.value.trim().length > 0 &&
    secret.value.length > 0,
)

onMounted(() => void store.initialize())
async function save(): Promise<void> {
  if (!canSave.value) return
  const ok = await store.save({
    pluginId: pluginId.value.trim(),
    connectionId: connectionId.value.trim(),
    value: { token: secret.value },
    updatedAt: Date.now(),
  })
  if (ok) {
    secret.value = ''
    selected.value = `${pluginId.value}:${connectionId.value}`
  }
}
async function clear(): Promise<void> {
  if (!selected.value) return
  const [nextPlugin, nextConnection] = selected.value.split(':')
  await store.clear(nextPlugin, nextConnection)
}
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col">
    <header class="flex shrink-0 items-start justify-between px-8 py-7">
      <div>
        <p class="tea-text-caption tea-weight-medium tea-fg-subtle">
          {{ t('management.credentials.kicker') }}
        </p>
        <h2 class="mt-1 tea-text-heading tea-weight-strong tea-tracking-label tea-fg">
          {{ t('management.credentials.title') }}
        </h2>
        <p class="mt-2 max-w-xl tea-text-body tea-fg-muted">
          {{ t('management.credentials.description') }}
        </p>
      </div>
      <span
        class="tea-radius-pill tea-bg-success-subtle px-2.5 py-1 tea-text-caption tea-weight-medium tea-fg-success"
        >{{ t('management.credentials.keychainBadge') }}</span
      >
    </header>
    <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-8 px-8 pb-8">
      <div class="min-w-0 overflow-auto">
        <div v-if="store.loading" class="py-10 tea-text-body tea-fg-subtle">
          {{ t('management.loading') }}
        </div>
        <div
          v-else-if="store.records.length === 0"
          class="flex min-h-56 items-center justify-center tea-bg-subtle text-center"
        >
          <div>
            <span class="i-mdi-key-off-outline mx-auto size-8 tea-fg-disabled" aria-hidden="true" />
            <p class="mt-3 tea-text-body tea-weight-medium tea-fg-muted">
              {{ t('management.credentials.emptyTitle') }}
            </p>
            <p class="mt-1 tea-text-caption tea-fg-subtle">
              {{ t('management.credentials.emptyDescription') }}
            </p>
          </div>
        </div>
        <div v-else class="space-y-2">
          <TeaButton
            v-for="record in store.records"
            :key="`${record.pluginId}:${record.connectionId}`"
            class="flex w-full items-center justify-between tea-bg-subtle px-4 py-3 text-left transition-colors tea-hover-bg"
            @click="selected = `${record.pluginId}:${record.connectionId}`"
          >
            <span class="min-w-0"
              ><span class="block truncate tea-text-body tea-weight-medium tea-fg">{{
                record.connectionId
              }}</span
              ><span class="mt-1 block truncate tea-mono tea-text-caption tea-fg-subtle">{{
                record.pluginId
              }}</span></span
            ><span
              class="flex items-center gap-2 tea-text-caption"
              :class="record.configured ? 'tea-fg-success' : 'tea-fg-subtle'"
              ><span
                class="size-1.5 tea-radius-pill"
                :class="record.configured ? 'tea-bg-success' : 'tea-bg-disabled'"
              />{{
                record.configured
                  ? t('management.credentials.configured')
                  : t('management.credentials.notConfigured')
              }}</span
            >
          </TeaButton>
        </div>
      </div>
      <form class="tea-bg-subtle p-5" @submit.prevent="save">
        <p class="tea-text-body tea-weight-strong tea-fg">
          {{ t('management.credentials.addTitle') }}
        </p>
        <p class="mt-1 tea-text-caption leading-5 tea-fg-subtle">
          {{ t('management.credentials.addDescription') }}
        </p>
        <TeaInput
          v-model="pluginId"
          class="mt-5"
          :label="t('management.credentials.pluginId')"
          autocomplete="off"
        />
        <TeaInput
          v-model="connectionId"
          class="mt-4"
          :label="t('management.credentials.connectionId')"
          autocomplete="off"
        />
        <TeaInput
          v-model="secret"
          class="mt-4"
          type="password"
          :label="t('management.credentials.secret')"
          autocomplete="new-password"
        />
        <TeaButton
          :disabled="!canSave || store.saving"
          class="mt-5 flex w-full items-center justify-center gap-2 tea-bg-inverse px-3 py-2.5 tea-text-body tea-weight-medium tea-fg-inverse transition-colors tea-hover-bg-inverse disabled:cursor-not-allowed tea-disabled-bg"
          ><span class="i-mdi-content-save-outline size-4" aria-hidden="true" />{{
            store.saving ? t('management.saving') : t('management.credentials.save')
          }}</TeaButton
        >
        <TeaButton
          v-if="selected"
          type="button"
          class="mt-2 w-full px-3 py-2 tea-text-caption tea-weight-medium tea-fg-danger tea-hover-bg-danger"
          @click="clear"
          >{{ t('management.credentials.clear') }}</TeaButton
        >
        <p v-if="store.error" class="mt-3 tea-text-caption tea-fg-danger">{{ t(store.error) }}</p>
      </form>
    </div>
  </section>
</template>
