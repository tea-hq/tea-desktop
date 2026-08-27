<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { useI18n } from 'vue-i18n'
import { MANAGEMENT_SECTIONS, type ManagementSection } from '../contracts'

defineProps<{ activeSection: ManagementSection }>()
const emit = defineEmits<{ select: [section: ManagementSection] }>()
const { t } = useI18n()
</script>

<template>
  <aside class="flex w-60 shrink-0 flex-col tea-bg-subtle px-3 py-5">
    <div class="px-2">
      <p class="tea-text-micro tea-weight-strong uppercase tea-tracking-label tea-fg-subtle">{{ t('management.eyebrow') }}</p>
      <h1 class="mt-2 tea-text-title tea-weight-strong tea-tracking-label tea-fg">{{ t('management.title') }}</h1>
      <p class="mt-2 tea-text-caption leading-5 tea-fg-muted">{{ t('management.description') }}</p>
    </div>
    <nav class="mt-7 space-y-1" :aria-label="t('management.navigationLabel')">
      <TeaButton
        v-for="section in MANAGEMENT_SECTIONS"
        :key="section.id"
        class="group flex w-full items-start gap-3 tea-radius-control px-3 py-2.5 text-left transition-colors tea-focus-ring tea-focus-ring tea-focus-ring"
        :class="activeSection === section.id ? 'tea-bg-canvas tea-fg tea-elevation-low' : 'tea-fg-muted tea-hover-bg tea-hover-fg'"
        :aria-current="activeSection === section.id ? 'page' : undefined"
        @click="emit('select', section.id)"
      >
        <span :class="[section.icon, 'mt-0.5 size-4 shrink-0', activeSection === section.id ? 'tea-fg' : 'tea-fg-subtle tea-group-hover-fg']" aria-hidden="true" />
        <span class="min-w-0">
          <span class="block tea-text-body tea-weight-medium">{{ t(section.labelKey) }}</span>
          <span class="mt-0.5 block tea-text-caption leading-4 tea-fg-subtle">{{ t(section.descriptionKey) }}</span>
        </span>
      </TeaButton>
    </nav>
    <div class="mt-auto px-2 pt-8 tea-text-caption leading-4 tea-fg-subtle">{{ t('management.localOnly') }}</div>
  </aside>
</template>
