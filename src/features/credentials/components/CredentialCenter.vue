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
        <p class="text-sm font-medium text-subtle">
          {{ t('management.credentials.kicker') }}
        </p>
        <h2 class="mt-1 text-2xl font-semibold text-fg">
          {{ t('management.credentials.title') }}
        </h2>
        <p class="mt-2 max-w-xl text-base text-dim">
          {{ t('management.credentials.description') }}
        </p>
      </div>
      <span class="rounded-full bg-success-subtle px-2.5 py-1 text-sm font-medium text-success">{{
        t('management.credentials.keychainBadge')
      }}</span>
    </header>
    <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-8 px-8 pb-8">
      <div class="min-w-0 overflow-auto">
        <div v-if="store.loading" class="py-10 text-base text-subtle">
          {{ t('management.loading') }}
        </div>
        <div
          v-else-if="store.records.length === 0"
          class="flex min-h-56 items-center justify-center rounded-card bg-muted text-center"
        >
          <div>
            <span class="i-mdi-key-off-outline mx-auto size-8 text-disabled" aria-hidden="true" />
            <p class="mt-3 text-base font-medium text-dim">
              {{ t('management.credentials.emptyTitle') }}
            </p>
            <p class="mt-1 text-sm text-subtle">
              {{ t('management.credentials.emptyDescription') }}
            </p>
          </div>
        </div>
        <div v-else class="space-y-2">
          <TeaButton
            v-for="record in store.records"
            :key="`${record.pluginId}:${record.connectionId}`"
            class="flex w-full items-center justify-between rounded-card bg-muted px-4 py-3 text-left transition-colors hover:bg-hover"
            @click="selected = `${record.pluginId}:${record.connectionId}`"
          >
            <span class="min-w-0"
              ><span class="block truncate text-base font-medium text-fg">{{
                record.connectionId
              }}</span
              ><span class="mt-1 block truncate font-mono text-sm text-subtle">{{
                record.pluginId
              }}</span></span
            ><span
              class="flex items-center gap-2 text-sm"
              :class="record.configured ? 'text-success' : 'text-subtle'"
              ><span
                class="size-1.5 rounded-full"
                :class="record.configured ? 'bg-success' : 'bg-muted'"
              />{{
                record.configured
                  ? t('management.credentials.configured')
                  : t('management.credentials.notConfigured')
              }}</span
            >
          </TeaButton>
        </div>
      </div>
      <form class="rounded-card bg-muted p-6" @submit.prevent="save">
        <p class="text-base font-semibold text-fg">
          {{ t('management.credentials.addTitle') }}
        </p>
        <p class="mt-1 text-sm leading-5 text-subtle">
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
          appearance="primary"
          :disabled="!canSave || store.saving"
          class="mt-5 flex w-full items-center justify-center gap-2 px-3 text-sm"
          ><span class="i-mdi-content-save-outline size-4" aria-hidden="true" />{{
            store.saving ? t('management.saving') : t('management.credentials.save')
          }}</TeaButton
        >
        <TeaButton
          v-if="selected"
          type="button"
          class="mt-2 w-full px-3 py-2 text-sm font-medium text-danger hover:bg-danger-subtle"
          @click="clear"
          >{{ t('management.credentials.clear') }}</TeaButton
        >
        <p v-if="store.error" class="mt-3 text-sm text-danger">{{ t(store.error) }}</p>
      </form>
    </div>
  </section>
</template>
