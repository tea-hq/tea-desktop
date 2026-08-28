<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillsStore } from '../store'
const store = useSkillsStore()
const { t } = useI18n()
onMounted(store.initialize)
</script>
<template>
  <section class="flex min-w-0 flex-1 flex-col">
    <header class="px-8 py-7">
      <p class="tea-text-caption tea-weight-medium tea-fg-subtle">
        {{ t('management.skills.kicker') }}
      </p>
      <h2 class="mt-1 tea-text-heading tea-weight-strong tea-tracking-label tea-fg">
        {{ t('management.skills.title') }}
      </h2>
      <p class="mt-2 max-w-xl tea-text-body tea-fg-muted">
        {{ t('management.skills.description') }}
      </p>
    </header>
    <div class="mx-8 flex min-h-64 flex-1 items-center justify-center tea-bg-subtle text-center">
      <div>
        <span
          class="i-mdi-lightning-bolt-outline mx-auto size-9 tea-fg-disabled"
          aria-hidden="true"
        />
        <p class="mt-3 tea-text-body tea-weight-medium tea-fg-muted">
          {{ t('management.skills.emptyTitle') }}
        </p>
        <p class="mt-1 max-w-sm tea-text-caption leading-5 tea-fg-subtle">
          {{ t('management.skills.emptyDescription') }}
        </p>
        <TeaButton
          class="mt-5 tea-bg-inverse px-3 py-2 tea-text-caption tea-weight-medium tea-fg-inverse tea-hover-bg-inverse"
          >{{ t('management.skills.browse') }}</TeaButton
        >
      </div>
    </div>
  </section>
</template>
