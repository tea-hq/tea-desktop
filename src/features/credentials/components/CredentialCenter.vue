<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaIconButton, TeaInput } from '@/shared/ui'
import type { CredentialRecord } from '../contracts'
import { useCredentialsStore } from '../store'

const store = useCredentialsStore()
const { t } = useI18n()
const pluginId = ref('')
const connectionId = ref('')
const secret = ref('')
const showSecret = ref(false)
const selectedKey = ref<string | null>(null)
const creating = ref(false)

const selectedRecord = computed(() =>
  store.records.find((record) => recordKey(record) === selectedKey.value),
)
const configuredCount = computed(() => store.records.filter((record) => record.configured).length)
const needsAttentionCount = computed(
  () => store.records.filter((record) => !record.configured).length,
)
const canSave = computed(
  () =>
    pluginId.value.trim().length > 0 &&
    connectionId.value.trim().length > 0 &&
    secret.value.length > 0,
)

onMounted(() => void store.initialize())
watch(
  () => store.records,
  (records) => {
    if (!selectedKey.value && records[0]) selectRecord(records[0])
    if (selectedKey.value && !records.some((record) => recordKey(record) === selectedKey.value))
      startNew()
  },
  { immediate: true },
)

function recordKey(record: CredentialRecord): string {
  return `${record.pluginId}:${record.connectionId}`
}

function selectRecord(record: CredentialRecord): void {
  selectedKey.value = recordKey(record)
  pluginId.value = record.pluginId
  connectionId.value = record.connectionId
  secret.value = ''
  showSecret.value = false
  creating.value = false
  store.clearError()
}

function startNew(): void {
  selectedKey.value = null
  pluginId.value = ''
  connectionId.value = ''
  secret.value = ''
  showSecret.value = false
  creating.value = true
  store.clearError()
}

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
    showSecret.value = false
    selectedKey.value = `${pluginId.value.trim()}:${connectionId.value.trim()}`
    creating.value = false
  }
}

async function clear(): Promise<void> {
  const record = selectedRecord.value
  if (!record) return
  const ok = await store.clear(record.pluginId, record.connectionId)
  if (ok) startNew()
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value)) return t('management.credentials.notAvailable')
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value)
}
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="shrink-0 border-b border-line-soft px-6 py-6 lg:px-8">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            {{ t('management.credentials.kicker') }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="font-display text-3xl font-semibold text-fg">
              {{ t('management.credentials.title') }}
            </h2>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success"
            >
              <span class="i-mdi-shield-lock-outline size-3.5" aria-hidden="true" />
              {{ t('management.credentials.keychainBadge') }}
            </span>
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-5 text-dim">
            {{ t('management.credentials.description') }}
          </p>
        </div>
        <TeaButton appearance="secondary" size="small" class="shrink-0 px-3" @click="startNew">
          <span class="i-mdi-plus size-4" aria-hidden="true" />
          {{ t('management.credentials.newConnection') }}
        </TeaButton>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-6 pb-8 pt-5 lg:px-8">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">
            {{ t('management.credentials.stats.total') }}
          </p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ store.records.length }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">
            {{ t('management.credentials.stats.configured') }}
          </p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ configuredCount }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">
            {{ t('management.credentials.stats.attention') }}
          </p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ needsAttentionCount }}</p>
        </div>
      </div>

      <div class="mt-5 grid min-h-[28rem] gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="min-w-0 rounded-card border border-line-soft bg-canvas">
          <div class="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <div>
              <p class="text-sm font-semibold text-fg">
                {{ t('management.credentials.connections') }}
              </p>
              <p class="mt-0.5 text-xs text-subtle">
                {{ t('management.credentials.connectionCount', { count: store.records.length }) }}
              </p>
            </div>
            <TeaIconButton
              :label="t('management.credentials.newConnection')"
              icon="i-mdi-plus"
              size="small"
              @click="startNew"
            />
          </div>

          <div v-if="store.loading" class="space-y-3 px-4 py-5" aria-live="polite">
            <div v-for="index in 4" :key="index" class="flex animate-pulse items-center gap-3">
              <span class="size-9 rounded-full bg-muted" />
              <span class="flex-1 space-y-2">
                <span class="block h-3 w-1/3 rounded-full bg-muted" />
                <span class="block h-2.5 w-2/3 rounded-full bg-panel" />
              </span>
            </div>
          </div>
          <div
            v-else-if="store.records.length === 0"
            class="flex min-h-72 items-center justify-center px-6 text-center"
          >
            <div>
              <span
                class="i-mdi-key-chain-variant mx-auto size-8 text-disabled"
                aria-hidden="true"
              />
              <p class="mt-3 text-sm font-semibold text-dim">
                {{ t('management.credentials.emptyTitle') }}
              </p>
              <p class="mt-1 max-w-xs text-xs leading-5 text-subtle">
                {{ t('management.credentials.emptyDescription') }}
              </p>
              <TeaButton appearance="secondary" size="small" class="mt-4 px-3" @click="startNew">
                <span class="i-mdi-plus size-4" aria-hidden="true" />
                {{ t('management.credentials.newConnection') }}
              </TeaButton>
            </div>
          </div>
          <div v-else class="divide-y divide-line-soft">
            <TeaButton
              v-for="record in store.records"
              :key="recordKey(record)"
              type="button"
              appearance="ghost"
              class="flex w-full !justify-start !rounded-none !border-transparent px-4 py-3 text-left transition-colors hover:bg-panel"
              :class="selectedKey === recordKey(record) ? 'bg-panel' : ''"
              :aria-pressed="selectedKey === recordKey(record)"
              @click="selectRecord(record)"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-full"
                :class="
                  record.configured ? 'bg-success-subtle text-success' : 'bg-muted text-subtle'
                "
              >
                <span class="i-mdi-key-outline size-4" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-fg">{{
                  record.connectionId
                }}</span>
                <span class="mt-1 block truncate font-mono text-xs text-subtle">{{
                  record.pluginId
                }}</span>
              </span>
              <span class="hidden shrink-0 text-right sm:block">
                <span
                  class="block text-xs font-medium"
                  :class="record.configured ? 'text-success' : 'text-warning'"
                >
                  {{
                    record.configured
                      ? t('management.credentials.configured')
                      : t('management.credentials.notConfigured')
                  }}
                </span>
                <span class="mt-1 block text-[0.6875rem] text-subtle">{{
                  formatUpdatedAt(record.updatedAt)
                }}</span>
              </span>
              <span class="i-mdi-chevron-right size-4 shrink-0 text-disabled" aria-hidden="true" />
            </TeaButton>
          </div>
        </div>

        <form
          class="min-w-0 rounded-card border border-line-soft bg-panel p-5"
          @submit.prevent="save"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-fg">
                {{
                  creating || !selectedRecord
                    ? t('management.credentials.addTitle')
                    : t('management.credentials.editTitle')
                }}
              </p>
              <p class="mt-1 text-xs leading-5 text-subtle">
                {{ t('management.credentials.addDescription') }}
              </p>
            </div>
            <span class="i-mdi-lock-outline size-5 shrink-0 text-success" aria-hidden="true" />
          </div>
          <div class="mt-5 space-y-4">
            <label class="block text-xs font-medium text-dim">
              {{ t('management.credentials.pluginId') }}
              <TeaInput
                v-model="pluginId"
                class="mt-1.5"
                :label="t('management.credentials.pluginId')"
                autocomplete="off"
              />
            </label>
            <label class="block text-xs font-medium text-dim">
              {{ t('management.credentials.connectionId') }}
              <TeaInput
                v-model="connectionId"
                class="mt-1.5"
                :label="t('management.credentials.connectionId')"
                autocomplete="off"
              />
            </label>
            <label class="block text-xs font-medium text-dim">
              {{ t('management.credentials.secret') }}
              <div class="relative mt-1.5">
                <TeaInput
                  v-model="secret"
                  class="pr-10"
                  :type="showSecret ? 'text' : 'password'"
                  :label="t('management.credentials.secret')"
                  autocomplete="new-password"
                />
                <TeaIconButton
                  class="absolute right-1 top-1/2 -translate-y-1/2"
                  :label="
                    showSecret
                      ? t('management.credentials.hideSecret')
                      : t('management.credentials.showSecret')
                  "
                  :icon="showSecret ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'"
                  size="small"
                  @click="showSecret = !showSecret"
                />
              </div>
            </label>
          </div>
          <div class="mt-5 flex items-center gap-2 border-t border-line-soft pt-4">
            <TeaButton
              appearance="primary"
              size="small"
              :disabled="!canSave"
              :loading="store.saving"
              class="px-3"
            >
              <span
                v-if="!store.saving"
                class="i-mdi-content-save-outline size-4"
                aria-hidden="true"
              />
              {{ store.saving ? t('management.saving') : t('management.credentials.save') }}
            </TeaButton>
            <TeaButton
              v-if="selectedRecord?.configured"
              type="button"
              appearance="danger"
              size="small"
              :disabled="store.saving"
              class="px-3"
              @click="clear"
            >
              <span class="i-mdi-trash-can-outline size-4" aria-hidden="true" />
              {{ t('management.credentials.clear') }}
            </TeaButton>
          </div>
          <p v-if="store.error" class="mt-3 flex gap-2 text-xs leading-4 text-danger" role="alert">
            <span class="i-mdi-alert-circle-outline size-4 shrink-0" aria-hidden="true" />
            {{ t(store.error) }}
          </p>
          <div class="mt-6 border-t border-line-soft pt-4">
            <p class="flex items-center gap-2 text-xs font-semibold text-dim">
              <span class="i-mdi-shield-check-outline size-4 text-success" aria-hidden="true" />
              {{ t('management.credentials.secureTitle') }}
            </p>
            <p class="mt-1 text-xs leading-5 text-subtle">
              {{ t('management.credentials.secureDescription') }}
            </p>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
