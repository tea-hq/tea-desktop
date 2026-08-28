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
      <p class="text-sm font-medium text-subtle">
        {{ t('management.skills.kicker') }}
      </p>
      <h2 class="mt-1 text-2xl font-semibold text-fg">
        {{ t('management.skills.title') }}
      </h2>
      <p class="mt-2 max-w-xl text-base text-dim">
        {{ t('management.skills.description') }}
      </p>
    </header>
    <div
      class="mx-8 flex min-h-64 flex-1 items-center justify-center rounded-card bg-muted text-center"
    >
      <div>
        <span
          class="i-mdi-lightning-bolt-outline mx-auto size-9 text-disabled"
          aria-hidden="true"
        />
        <p class="mt-3 text-base font-medium text-dim">
          {{ t('management.skills.emptyTitle') }}
        </p>
        <p class="mt-1 max-w-sm text-sm leading-5 text-subtle">
          {{ t('management.skills.emptyDescription') }}
        </p>
        <TeaButton appearance="primary" class="mt-5 px-3 text-sm">{{
          t('management.skills.browse')
        }}</TeaButton>
      </div>
    </div>
  </section>
</template>
