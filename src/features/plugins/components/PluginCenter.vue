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
        <p class="tea-text-caption tea-weight-medium tea-fg-subtle">
          {{ t('management.plugins.kicker') }}
        </p>
        <h2 class="mt-1 tea-text-heading tea-weight-strong tea-tracking-label tea-fg">
          {{ t('management.plugins.title') }}
        </h2>
        <p class="mt-2 max-w-xl tea-text-body tea-fg-muted">
          {{ t('management.plugins.description') }}
        </p>
      </div>
      <TeaButton
        class="inline-flex items-center gap-2 tea-bg-inverse px-3 py-2 tea-text-caption tea-weight-medium tea-fg-inverse tea-hover-bg-inverse"
        ><span class="i-mdi-import size-4" aria-hidden="true" />{{
          t('management.plugins.install')
        }}</TeaButton
      >
    </header>
    <div class="min-h-0 flex-1 overflow-auto px-8 pb-8">
      <div v-if="store.loading" class="py-10 tea-text-body tea-fg-subtle">
        {{ t('management.loading') }}
      </div>
      <div
        v-else-if="store.plugins.length === 0"
        class="flex min-h-64 items-center justify-center tea-bg-subtle text-center"
      >
        <div>
          <span
            class="i-mdi-puzzle-remove-outline mx-auto size-9 tea-fg-disabled"
            aria-hidden="true"
          />
          <p class="mt-3 tea-text-body tea-weight-medium tea-fg-muted">
            {{ t('management.plugins.emptyTitle') }}
          </p>
          <p class="mt-1 max-w-xs tea-text-caption leading-5 tea-fg-subtle">
            {{ t('management.plugins.emptyDescription') }}
          </p>
        </div>
      </div>
      <div v-else class="grid gap-3 md:grid-cols-2">
        <article v-for="plugin in store.plugins" :key="plugin.id" class="tea-bg-subtle p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 gap-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center tea-bg-canvas tea-fg-muted"
                ><span class="i-mdi-puzzle-outline size-5" aria-hidden="true"
              /></span>
              <div class="min-w-0">
                <h3 class="truncate tea-text-body tea-weight-strong tea-fg">
                  {{ plugin.displayName }}
                </h3>
                <p class="mt-0.5 truncate tea-mono tea-text-caption tea-fg-subtle">
                  {{ plugin.id }} · v{{ plugin.version }}
                </p>
              </div>
            </div>
            <TeaButton
              class="relative h-5 w-9 tea-radius-pill transition-colors"
              :class="plugin.enabled ? 'tea-bg-success' : 'tea-bg-disabled'"
              :aria-label="t('management.plugins.toggle')"
              @click="store.setEnabled(plugin, !plugin.enabled)"
              ><span
                class="absolute top-0.5 size-4 tea-radius-pill tea-bg-canvas tea-elevation-low transition-transform"
                :class="plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'"
            /></TeaButton>
          </div>
          <p class="mt-4 tea-text-caption leading-5 tea-fg-muted">
            {{ plugin.description || t('management.plugins.noDescription') }}
          </p>
          <div class="mt-4 flex items-center gap-4 tea-text-caption tea-fg-subtle">
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
