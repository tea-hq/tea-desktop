<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginsStore } from '../store'

const store = usePluginsStore()
const { t } = useI18n()
onMounted(() => void store.initialize())
</script>

<template>
  <section class="flex min-w-0 flex-1 flex-col">
    <header class="flex shrink-0 items-start justify-between px-8 py-7">
      <div>
        <p class="text-sm font-medium text-subtle">
          {{ t('management.plugins.kicker') }}
        </p>
        <h2 class="mt-1 text-2xl font-semibold text-fg">
          {{ t('management.plugins.title') }}
        </h2>
        <p class="mt-2 max-w-xl text-base text-dim">
          {{ t('management.plugins.description') }}
        </p>
      </div>
      <TeaButton appearance="primary" class="inline-flex items-center gap-2 px-3 text-sm"
        ><span class="i-mdi-import size-4" aria-hidden="true" />{{
          t('management.plugins.install')
        }}</TeaButton
      >
    </header>
    <div class="min-h-0 flex-1 overflow-auto px-8 pb-8">
      <div v-if="store.loading" class="py-10 text-base text-subtle">
        {{ t('management.loading') }}
      </div>
      <div
        v-else-if="store.plugins.length === 0"
        class="flex min-h-64 items-center justify-center rounded-card bg-muted text-center"
      >
        <div>
          <span
            class="i-mdi-puzzle-remove-outline mx-auto size-9 text-disabled"
            aria-hidden="true"
          />
          <p class="mt-3 text-base font-medium text-dim">
            {{ t('management.plugins.emptyTitle') }}
          </p>
          <p class="mt-1 max-w-xs text-sm leading-5 text-subtle">
            {{ t('management.plugins.emptyDescription') }}
          </p>
        </div>
      </div>
      <div v-else class="grid gap-3 md:grid-cols-2">
        <article v-for="plugin in store.plugins" :key="plugin.id" class="rounded-card bg-muted p-6">
          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 gap-3">
              <span class="flex size-9 shrink-0 items-center justify-center bg-canvas text-dim"
                ><span class="i-mdi-puzzle-outline size-5" aria-hidden="true"
              /></span>
              <div class="min-w-0">
                <h3 class="truncate text-base font-semibold text-fg">
                  {{ plugin.displayName }}
                </h3>
                <p class="mt-0.5 truncate font-mono text-sm text-subtle">
                  {{ plugin.id }} · v{{ plugin.version }}
                </p>
              </div>
            </div>
            <TeaButton
              class="relative h-5 w-9 rounded-full transition-colors"
              :class="plugin.enabled ? 'bg-success' : 'bg-muted'"
              :aria-label="t('management.plugins.toggle')"
              @click="store.setEnabled(plugin, !plugin.enabled)"
              ><span
                class="absolute top-0.5 size-4 rounded-full bg-canvas transition-transform"
                :class="plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'"
            /></TeaButton>
          </div>
          <p class="mt-4 text-sm leading-5 text-dim">
            {{ plugin.description || t('management.plugins.noDescription') }}
          </p>
          <div class="mt-4 flex items-center gap-4 text-sm text-subtle">
            <span>{{ t('management.plugins.actionsCount', { count: plugin.actions.length }) }}</span
            ><span>{{
              t('management.plugins.connectionsCount', { count: plugin.connections.length })
            }}</span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
