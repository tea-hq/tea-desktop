<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { useI18n } from 'vue-i18n'
import { MANAGEMENT_SECTIONS, type ManagementSection } from '../contracts'

defineProps<{ activeSection: ManagementSection }>()
const emit = defineEmits<{ select: [section: ManagementSection] }>()
const { t } = useI18n()
</script>

<template>
  <aside class="flex w-60 shrink-0 flex-col bg-surface px-3 py-5">
    <div class="px-2">
      <p class="text-xs font-semibold uppercase tracking-normal text-subtle">
        {{ t('management.eyebrow') }}
      </p>
      <h1 class="mt-2 text-xl font-semibold tracking-normal text-fg">
        {{ t('management.title') }}
      </h1>
      <p class="mt-2 text-sm leading-5 text-dim">{{ t('management.description') }}</p>
    </div>
    <nav class="mt-7 space-y-1" :aria-label="t('management.navigationLabel')">
      <TeaButton
        v-for="section in MANAGEMENT_SECTIONS"
        :key="section.id"
        class="group flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="
          activeSection === section.id
            ? 'bg-canvas text-fg '
            : 'text-dim hover:bg-hover hover:text-fg'
        "
        :aria-current="activeSection === section.id ? 'page' : undefined"
        @click="emit('select', section.id)"
      >
        <span
          :class="[
            section.icon,
            'mt-0.5 size-4 shrink-0',
            activeSection === section.id ? 'text-fg' : 'text-subtle group-hover:text-dim',
          ]"
          aria-hidden="true"
        />
        <span class="min-w-0">
          <span class="block text-base font-medium">{{ t(section.labelKey) }}</span>
          <span class="mt-0.5 block text-sm leading-4 text-subtle">{{
            t(section.descriptionKey)
          }}</span>
        </span>
      </TeaButton>
    </nav>
    <div class="mt-auto px-2 pt-8 text-sm leading-4 text-subtle">
      {{ t('management.localOnly') }}
    </div>
  </aside>
</template>
