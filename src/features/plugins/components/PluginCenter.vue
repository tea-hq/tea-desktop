<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaIconButton, TeaInput, TeaToggle } from '@/shared/ui'
import type { PluginRecord, PluginSource } from '../contracts'
import { usePluginsStore } from '../store'

const store = usePluginsStore()
const { t } = useI18n()
const query = ref('')
const filter = ref<'all' | PluginSource>('all')
const selectedKey = ref<string | null>(null)
const failedIconKeys = ref(new Set<string>())

const filteredPlugins = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  return [...store.plugins]
    .filter((plugin) => filter.value === 'all' || pluginSource(plugin) === filter.value)
    .filter((plugin) => {
      if (!normalized) return true
      return [plugin.displayName, plugin.id, plugin.description ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized)
    })
    .sort((left, right) => {
      const sourceOrder = pluginSource(left).localeCompare(pluginSource(right))
      return sourceOrder || left.displayName.localeCompare(right.displayName)
    })
})

const selectedPlugin = computed(() =>
  store.plugins.find((plugin) => pluginKey(plugin) === selectedKey.value),
)
const localCount = computed(
  () => store.plugins.filter((plugin) => pluginSource(plugin) === 'local').length,
)
const remoteCount = computed(
  () => store.plugins.filter((plugin) => pluginSource(plugin) === 'remote').length,
)
const actionCount = computed(() =>
  store.plugins.reduce((total, plugin) => total + plugin.actions.length, 0),
)
const configuredRemoteCount = computed(
  () => store.remotePlugins.filter((plugin) => plugin.credentialConfigured === true).length,
)

onMounted(() => void store.initialize())
watch(
  () => store.plugins,
  (plugins) => {
    if (!selectedKey.value && plugins[0]) selectedKey.value = pluginKey(plugins[0])
    if (selectedKey.value && !plugins.some((plugin) => pluginKey(plugin) === selectedKey.value))
      selectedKey.value = plugins[0] ? pluginKey(plugins[0]) : null
  },
  { immediate: true },
)

function pluginSource(plugin: PluginRecord): PluginSource {
  return plugin.source ?? 'local'
}

function pluginKey(plugin: PluginRecord): string {
  return `${pluginSource(plugin)}:${plugin.id}`
}

function pluginIconKey(plugin: PluginRecord): string {
  return `${pluginKey(plugin)}:${plugin.iconUrl ?? ''}`
}

function hasIcon(plugin: PluginRecord): boolean {
  return Boolean(plugin.iconUrl && !failedIconKeys.value.has(pluginIconKey(plugin)))
}

function iconFrameClass(plugin: PluginRecord): string {
  if (hasIcon(plugin)) return 'bg-canvas text-fg'
  return pluginSource(plugin) === 'remote'
    ? 'bg-brand-accent text-on-accent'
    : 'bg-accent text-on-accent'
}

function handleIconError(plugin: PluginRecord): void {
  const key = pluginIconKey(plugin)
  if (failedIconKeys.value.has(key)) return
  failedIconKeys.value = new Set(failedIconKeys.value).add(key)
}

function sourceLabel(source: PluginSource): string {
  return t(`management.plugins.sources.${source}`)
}

function setFilter(value: string): void {
  filter.value = value as typeof filter.value
}

function clearFilters(): void {
  query.value = ''
  filter.value = 'all'
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function needsCredential(plugin: PluginRecord): boolean {
  return pluginSource(plugin) === 'remote' && plugin.credentialConfigured === false
}

function formatUpdatedAt(value?: string): string {
  if (!value) return t('management.plugins.notAvailable')
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return t('management.plugins.notAvailable')
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp)
}

function selectPlugin(plugin: PluginRecord): void {
  selectedKey.value = pluginKey(plugin)
}
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="shrink-0 border-b border-line-soft px-6 py-6 lg:px-8">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            {{ t('management.plugins.kicker') }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="font-display text-3xl font-semibold text-fg">
              {{ t('management.plugins.title') }}
            </h2>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success"
            >
              <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {{ t('management.plugins.catalogReady') }}
            </span>
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-5 text-dim">
            {{ t('management.plugins.description') }}
          </p>
        </div>
        <TeaButton
          appearance="primary"
          size="small"
          :loading="store.remoteLoading"
          class="shrink-0 px-3"
          @click="store.syncRemote()"
        >
          <span
            v-if="!store.remoteLoading"
            class="i-mdi-cloud-sync-outline size-4"
            aria-hidden="true"
          />
          {{ t('management.plugins.syncCloud') }}
        </TeaButton>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-6 pb-8 pt-5 lg:px-8">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.plugins.stats.total') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ store.plugins.length }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.plugins.stats.local') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ localCount }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.plugins.stats.cloud') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ remoteCount }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.plugins.stats.actions') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ actionCount }}</p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3 border-y border-line-soft py-3">
        <div
          class="nav-pill-group"
          role="tablist"
          :aria-label="t('management.plugins.filterLabel')"
        >
          <TeaButton
            v-for="option in [
              {
                value: 'all',
                label: t('management.plugins.sources.all'),
                count: store.plugins.length,
              },
              { value: 'local', label: t('management.plugins.sources.local'), count: localCount },
              {
                value: 'remote',
                label: t('management.plugins.sources.remote'),
                count: remoteCount,
              },
            ]"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="filter === option.value"
            appearance="ghost"
            size="small"
            class="nav-pill-group__item gap-1.5"
            @click="setFilter(option.value)"
          >
            {{ option.label }}
            <span class="text-xs text-subtle">{{ option.count }}</span>
          </TeaButton>
        </div>
        <TeaInput
          v-model="query"
          class="w-full sm:w-64"
          size="small"
          type="search"
          :label="t('management.plugins.search')"
          :placeholder="t('management.plugins.search')"
        />
        <div class="ml-auto flex items-center gap-2 text-xs text-subtle">
          <span
            class="size-1.5 rounded-full"
            :class="store.remoteError ? 'bg-danger' : 'bg-success'"
            aria-hidden="true"
          />
          {{
            store.remoteError
              ? t('management.plugins.syncNeedsAttention')
              : t('management.plugins.syncReady', { count: configuredRemoteCount })
          }}
        </div>
      </div>

      <p
        v-if="store.error || store.remoteError"
        class="mt-4 flex items-center gap-2 rounded-control bg-danger-subtle px-3 py-2 text-sm text-danger"
        role="alert"
      >
        <span class="i-mdi-alert-circle-outline size-4 shrink-0" aria-hidden="true" />
        {{ t(store.error ?? store.remoteError!) }}
      </p>

      <div class="mt-5 grid min-h-[26rem] gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="min-w-0 rounded-card border border-line-soft bg-canvas">
          <div class="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <div>
              <p class="text-sm font-semibold text-fg">{{ t('management.plugins.inventory') }}</p>
              <p class="mt-0.5 text-xs text-subtle">
                {{ t('management.plugins.inventoryCount', { count: filteredPlugins.length }) }}
              </p>
            </div>
            <TeaIconButton
              :label="t('management.plugins.clearSearch')"
              icon="i-mdi-filter-variant-remove"
              size="small"
              :disabled="!query && filter === 'all'"
              @click="clearFilters"
            />
          </div>

          <div v-if="store.loading" class="space-y-3 px-4 py-5" aria-live="polite">
            <div v-for="index in 4" :key="index" class="flex animate-pulse items-center gap-3">
              <span class="size-10 rounded-control bg-muted" />
              <span class="flex-1 space-y-2">
                <span class="block h-3 w-1/3 rounded-full bg-muted" />
                <span class="block h-2.5 w-2/3 rounded-full bg-panel" />
              </span>
            </div>
          </div>
          <div
            v-else-if="filteredPlugins.length === 0"
            class="flex min-h-72 items-center justify-center px-6 text-center"
          >
            <div>
              <span class="i-mdi-puzzle-outline mx-auto size-8 text-disabled" aria-hidden="true" />
              <p class="mt-3 text-sm font-semibold text-dim">
                {{
                  query || filter !== 'all'
                    ? t('management.plugins.noMatches')
                    : t('management.plugins.emptyTitle')
                }}
              </p>
              <p class="mt-1 max-w-xs text-xs leading-5 text-subtle">
                {{
                  query || filter !== 'all'
                    ? t('management.plugins.noMatchesDescription')
                    : t('management.plugins.emptyDescription')
                }}
              </p>
            </div>
          </div>
          <div v-else class="divide-y divide-line-soft">
            <article
              v-for="plugin in filteredPlugins"
              :key="pluginKey(plugin)"
              class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-panel"
              :class="selectedKey === pluginKey(plugin) ? 'bg-panel' : ''"
              data-plugin-row
              @click="selectPlugin(plugin)"
            >
              <TeaButton
                appearance="ghost"
                class="flex min-w-0 flex-1 !justify-start !rounded-none !border-transparent !bg-transparent !px-0 !py-0 text-left !hover:bg-transparent !active:bg-transparent"
                :aria-pressed="selectedKey === pluginKey(plugin)"
                @click.stop="selectPlugin(plugin)"
              >
                <span
                  class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control text-sm font-semibold"
                  data-plugin-icon-frame
                  :class="iconFrameClass(plugin)"
                >
                  <img
                    v-if="hasIcon(plugin)"
                    data-plugin-icon
                    class="size-full object-contain p-1"
                    :src="plugin.iconUrl"
                    :alt="plugin.displayName"
                    loading="lazy"
                    @error="handleIconError(plugin)"
                  />
                  <span v-else data-plugin-icon-fallback>{{ initials(plugin.displayName) }}</span>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="truncate text-sm font-semibold text-fg">{{
                      plugin.displayName
                    }}</span>
                    <span
                      class="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-subtle"
                    >
                      {{ sourceLabel(pluginSource(plugin)) }}
                    </span>
                  </span>
                  <span class="mt-1 block truncate font-mono text-xs text-subtle">{{
                    plugin.id
                  }}</span>
                </span>
              </TeaButton>
              <span class="hidden shrink-0 items-center gap-3 text-xs text-subtle sm:flex">
                <span>{{ plugin.actions.length }} {{ t('management.plugins.actionShort') }}</span>
                <span v-if="needsCredential(plugin)" class="text-warning">
                  {{ t('management.plugins.needsCredential') }}
                </span>
              </span>
              <TeaToggle
                v-if="pluginSource(plugin) === 'local'"
                :label="t('management.plugins.toggle', { name: plugin.displayName })"
                :model-value="plugin.enabled"
                :disabled="store.busyId === plugin.id"
                @click.stop
                @update:model-value="store.setEnabled(plugin, $event)"
              />
              <span
                v-else
                class="i-mdi-cloud-check-outline size-4 shrink-0 text-brand-accent"
                aria-hidden="true"
              />
            </article>
          </div>
        </div>

        <aside class="min-w-0 rounded-card border border-line-soft bg-panel p-5">
          <template v-if="selectedPlugin">
            <div class="flex items-start gap-3">
              <span
                class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-control text-sm font-semibold"
                data-plugin-icon-frame
                :class="iconFrameClass(selectedPlugin)"
              >
                <img
                  v-if="hasIcon(selectedPlugin)"
                  data-plugin-icon
                  class="size-full object-contain p-1"
                  :src="selectedPlugin.iconUrl"
                  :alt="selectedPlugin.displayName"
                  loading="lazy"
                  @error="handleIconError(selectedPlugin)"
                />
                <span v-else data-plugin-icon-fallback>{{
                  initials(selectedPlugin.displayName)
                }}</span>
              </span>
              <div class="min-w-0">
                <p class="truncate text-base font-semibold text-fg">
                  {{ selectedPlugin.displayName }}
                </p>
                <p class="mt-1 truncate font-mono text-xs text-subtle">{{ selectedPlugin.id }}</p>
              </div>
            </div>
            <div class="mt-5 flex flex-wrap gap-2">
              <span class="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-dim">
                {{ sourceLabel(pluginSource(selectedPlugin)) }}
              </span>
              <span
                class="rounded-full px-2.5 py-1 text-xs font-medium"
                :class="
                  selectedPlugin.enabled ? 'bg-success-subtle text-success' : 'bg-muted text-subtle'
                "
              >
                {{
                  selectedPlugin.enabled
                    ? t('management.plugins.enabled')
                    : t('management.plugins.disabled')
                }}
              </span>
            </div>
            <p class="mt-4 text-sm leading-5 text-dim">
              {{ selectedPlugin.description || t('management.plugins.noDescription') }}
            </p>
            <dl
              class="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line-soft py-4 text-xs"
            >
              <div>
                <dt class="text-subtle">{{ t('management.plugins.detail.sourceFormat') }}</dt>
                <dd class="mt-1 font-mono text-dim">
                  {{ selectedPlugin.sourceFormat || t('management.plugins.notAvailable') }}
                </dd>
              </div>
              <div>
                <dt class="text-subtle">{{ t('management.plugins.detail.updated') }}</dt>
                <dd class="mt-1 text-dim">{{ formatUpdatedAt(selectedPlugin.updatedAt) }}</dd>
              </div>
              <div>
                <dt class="text-subtle">{{ t('management.plugins.detail.connections') }}</dt>
                <dd class="mt-1 text-dim">{{ selectedPlugin.connections.length }}</dd>
              </div>
              <div>
                <dt class="text-subtle">{{ t('management.plugins.detail.actions') }}</dt>
                <dd class="mt-1 text-dim">{{ selectedPlugin.actions.length }}</dd>
              </div>
            </dl>
            <div class="mt-5">
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                  {{ t('management.plugins.operations') }}
                </p>
                <span class="font-mono text-xs text-subtle">v{{ selectedPlugin.version }}</span>
              </div>
              <div class="mt-3 divide-y divide-line-soft border-y border-line-soft">
                <div
                  v-for="action in selectedPlugin.actions"
                  :key="action.id"
                  class="flex items-center gap-2 py-2.5"
                >
                  <span
                    class="flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold"
                    :class="
                      action.effect === 'read'
                        ? 'bg-brand-accent/10 text-brand-accent'
                        : 'bg-warning-subtle text-warning'
                    "
                  >
                    {{ action.effect === 'read' ? 'R' : 'W' }}
                  </span>
                  <span class="min-w-0 flex-1 truncate font-mono text-xs text-dim">{{
                    action.id
                  }}</span>
                  <span class="shrink-0 text-[0.6875rem] text-subtle">{{ action.effect }}</span>
                </div>
              </div>
            </div>
            <p
              v-if="needsCredential(selectedPlugin)"
              class="mt-4 flex gap-2 text-xs leading-4 text-warning"
            >
              <span class="i-mdi-key-alert-outline size-4 shrink-0" aria-hidden="true" />
              {{ t('management.plugins.detail.credentialMissing') }}
            </p>
          </template>
          <div v-else class="flex h-full min-h-64 items-center justify-center text-center">
            <div>
              <span
                class="i-mdi-cursor-default-click-outline mx-auto size-7 text-disabled"
                aria-hidden="true"
              />
              <p class="mt-3 text-sm font-semibold text-dim">
                {{ t('management.plugins.selectTitle') }}
              </p>
              <p class="mt-1 max-w-xs text-xs leading-5 text-subtle">
                {{ t('management.plugins.selectDescription') }}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>
