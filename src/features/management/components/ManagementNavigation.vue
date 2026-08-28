<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { useI18n } from 'vue-i18n'
import { MANAGEMENT_SECTIONS, type ManagementSection } from '../contracts'

defineProps<{ activeSection: ManagementSection }>()
const emit = defineEmits<{ select: [section: ManagementSection] }>()
const { t } = useI18n()
</script>

<template>
  <aside class="flex w-60 shrink-0 flex-col border-r border-line-soft bg-panel px-3 py-5">
    <div class="px-2">
      <p class="text-xs font-medium text-subtle">
        {{ t('management.eyebrow') }}
      </p>
      <h1 class="mt-1.5 text-lg font-semibold tracking-normal text-fg">
        {{ t('management.title') }}
      </h1>
      <p class="mt-2 text-sm leading-5 text-dim">{{ t('management.description') }}</p>
    </div>
    <nav class="mt-5 space-y-1" :aria-label="t('management.navigationLabel')">
      <TeaButton
        v-for="section in MANAGEMENT_SECTIONS"
        :key="section.id"
        appearance="ghost"
        class="management-nav-row group flex w-full items-start justify-start gap-2.5 px-2.5 py-2 text-left"
        :class="
          activeSection === section.id
            ? 'bg-canvas text-fg'
            : 'text-dim hover:bg-canvas hover:text-fg'
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
          <span class="block text-sm font-medium">{{ t(section.labelKey) }}</span>
          <span class="mt-0.5 block text-sm leading-4 text-subtle">{{
            t(section.descriptionKey)
          }}</span>
        </span>
      </TeaButton>
    </nav>
    <div class="mt-auto px-2 pt-6 text-sm leading-4 text-subtle">
      {{ t('management.localOnly') }}
    </div>
  </aside>
</template>

<style scoped>
.management-nav-row {
  border-radius: var(--tea-radius-inline);
}
</style>
