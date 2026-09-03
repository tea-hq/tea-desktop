<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaIconButton, TeaInput, TeaToggle } from '@/shared/ui'
import type { SkillRecord } from '../contracts'
import { useSkillsStore } from '../store'

const store = useSkillsStore()
const { t } = useI18n()
const skillSources = ['builtIn', 'local', 'workspace'] as const
const query = ref('')
const filter = ref<'all' | SkillRecord['source']>('all')
const sourcePanelOpen = ref(false)

const filteredSkills = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  return [...store.skills]
    .filter((skill) => filter.value === 'all' || skill.source === filter.value)
    .filter((skill) => {
      if (!normalized) return true
      return [skill.displayName, skill.id, skill.description]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized)
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
})
const enabledCount = computed(() => store.skills.filter((skill) => skill.enabled).length)
const sourceCount = computed(() => new Set(store.skills.map((skill) => skill.source)).size)

const sourceOptions = computed(() => [
  { value: 'all', label: t('management.skills.sources.all'), count: store.skills.length },
  ...(['builtIn', 'local', 'workspace'] as const).map((source) => ({
    value: source,
    label: t(`management.skills.sources.${source}`),
    count: store.skills.filter((skill) => skill.source === source).length,
  })),
])

onMounted(() => void store.initialize())

function sourceLabel(source: SkillRecord['source']): string {
  return t(`management.skills.sources.${source}`)
}

function setFilter(value: string): void {
  filter.value = value as typeof filter.value
}

function clearFilters(): void {
  query.value = ''
  filter.value = 'all'
}
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="shrink-0 border-b border-line-soft px-6 py-6 lg:px-8">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            {{ t('management.skills.kicker') }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="font-display text-3xl font-semibold text-fg">
              {{ t('management.skills.title') }}
            </h2>
            <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-subtle">
              {{ t('management.skills.foundationBadge') }}
            </span>
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-5 text-dim">
            {{ t('management.skills.description') }}
          </p>
        </div>
        <TeaButton
          appearance="secondary"
          size="small"
          class="shrink-0 px-3"
          :aria-expanded="sourcePanelOpen"
          @click="sourcePanelOpen = !sourcePanelOpen"
        >
          <span class="i-mdi-source-branch-plus size-4" aria-hidden="true" />
          {{ t('management.skills.browse') }}
        </TeaButton>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-6 pb-8 pt-5 lg:px-8">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.skills.stats.total') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ store.skills.length }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.skills.stats.enabled') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ enabledCount }}</p>
        </div>
        <div class="rounded-card border border-line-soft bg-panel px-4 py-3">
          <p class="text-xs font-medium text-subtle">{{ t('management.skills.stats.sources') }}</p>
          <p class="mt-1 font-display text-2xl font-semibold text-fg">{{ sourceCount }}</p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3 border-y border-line-soft py-3">
        <div class="nav-pill-group" role="tablist" :aria-label="t('management.skills.filterLabel')">
          <TeaButton
            v-for="option in sourceOptions"
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
          :label="t('management.skills.search')"
          :placeholder="t('management.skills.search')"
        />
        <TeaIconButton
          :label="t('management.skills.clearSearch')"
          icon="i-mdi-filter-variant-remove"
          size="small"
          :disabled="!query && filter === 'all'"
          @click="clearFilters"
        />
      </div>

      <div class="mt-5 grid min-h-[26rem] gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="min-w-0 rounded-card border border-line-soft bg-canvas">
          <div class="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <div>
              <p class="text-sm font-semibold text-fg">{{ t('management.skills.library') }}</p>
              <p class="mt-0.5 text-xs text-subtle">
                {{ t('management.skills.libraryCount', { count: filteredSkills.length }) }}
              </p>
            </div>
            <span class="font-mono text-xs text-subtle">SKILL/01</span>
          </div>
          <div v-if="store.loading" class="space-y-3 px-4 py-5" aria-live="polite">
            <div v-for="index in 4" :key="index" class="flex animate-pulse items-center gap-3">
              <span class="size-9 rounded-control bg-muted" />
              <span class="flex-1 space-y-2">
                <span class="block h-3 w-1/3 rounded-full bg-muted" />
                <span class="block h-2.5 w-2/3 rounded-full bg-panel" />
              </span>
            </div>
          </div>
          <div
            v-else-if="filteredSkills.length === 0"
            class="flex min-h-72 items-center justify-center px-6 text-center"
          >
            <div>
              <span
                class="i-mdi-lightning-bolt-outline mx-auto size-8 text-disabled"
                aria-hidden="true"
              />
              <p class="mt-3 text-sm font-semibold text-dim">
                {{
                  query || filter !== 'all'
                    ? t('management.skills.noMatches')
                    : t('management.skills.emptyTitle')
                }}
              </p>
              <p class="mt-1 max-w-xs text-xs leading-5 text-subtle">
                {{
                  query || filter !== 'all'
                    ? t('management.skills.noMatchesDescription')
                    : t('management.skills.emptyDescription')
                }}
              </p>
              <TeaButton
                v-if="!query && filter === 'all'"
                appearance="secondary"
                size="small"
                class="mt-4 px-3"
                @click="sourcePanelOpen = true"
              >
                <span class="i-mdi-source-branch-plus size-4" aria-hidden="true" />
                {{ t('management.skills.browse') }}
              </TeaButton>
            </div>
          </div>
          <div v-else class="divide-y divide-line-soft">
            <div
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-control bg-muted text-dim"
              >
                <span class="i-mdi-lightning-bolt-outline size-4" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="truncate text-sm font-semibold text-fg">{{
                    skill.displayName
                  }}</span>
                  <span
                    class="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-subtle"
                    >{{ sourceLabel(skill.source) }}</span
                  >
                </span>
                <span class="mt-1 block truncate text-xs text-subtle">{{ skill.description }}</span>
              </span>
              <span class="hidden font-mono text-xs text-subtle sm:block"
                >v{{ skill.version }}</span
              >
              <TeaToggle
                :label="t('management.skills.toggle', { name: skill.displayName })"
                :model-value="skill.enabled"
                @update:model-value="store.setEnabled(skill, $event)"
              />
            </div>
          </div>
        </div>

        <aside class="min-w-0 rounded-card border border-line-soft bg-panel p-5">
          <p class="text-sm font-semibold text-fg">{{ t('management.skills.sourceTitle') }}</p>
          <p class="mt-1 text-xs leading-5 text-subtle">
            {{ t('management.skills.sourceDescription') }}
          </p>
          <div class="mt-5 divide-y divide-line-soft border-y border-line-soft">
            <div v-for="source in skillSources" :key="source" class="flex items-center gap-3 py-3">
              <span class="flex size-8 items-center justify-center rounded-full bg-canvas text-dim">
                <span
                  :class="
                    source === 'builtIn'
                      ? 'i-mdi-package-variant-closed'
                      : source === 'local'
                        ? 'i-mdi-folder-outline'
                        : 'i-mdi-briefcase-outline'
                  "
                  class="size-4"
                  aria-hidden="true"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-fg">{{
                  t(`management.skills.sources.${source}`)
                }}</span>
                <span class="mt-0.5 block text-xs text-subtle">{{
                  t(`management.skills.sourceStatus.${source}`)
                }}</span>
              </span>
              <span class="font-mono text-xs text-subtle">{{
                store.skills.filter((skill) => skill.source === source).length
              }}</span>
            </div>
          </div>
          <div v-if="sourcePanelOpen" class="mt-5 rounded-control bg-canvas p-3">
            <p class="text-xs font-semibold text-dim">
              {{ t('management.skills.sourcePanelTitle') }}
            </p>
            <p class="mt-1 text-xs leading-5 text-subtle">
              {{ t('management.skills.sourcePanelDescription') }}
            </p>
            <TeaButton
              type="button"
              size="small"
              class="mt-3 px-3"
              @click="sourcePanelOpen = false"
            >
              {{ t('management.skills.closeSourcePanel') }}
            </TeaButton>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>
