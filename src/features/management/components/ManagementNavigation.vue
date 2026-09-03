<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { useI18n } from 'vue-i18n'
import { MANAGEMENT_SECTIONS, type ManagementSection } from '../contracts'

defineProps<{ activeSection: ManagementSection }>()
const emit = defineEmits<{ select: [section: ManagementSection] }>()
const { t } = useI18n()
</script>

<template>
  <aside
    class="flex w-[15.5rem] shrink-0 flex-col border-r border-line-soft bg-panel px-3 py-4 max-md:w-16 max-md:px-2"
  >
    <div class="flex items-center gap-2 px-2.5 py-2 max-md:justify-center max-md:px-0">
      <span
        class="flex size-8 items-center justify-center rounded-control bg-accent text-sm font-bold text-on-accent"
      >
        T
      </span>
      <div class="min-w-0 max-md:hidden">
        <p class="truncate text-sm font-semibold text-fg">{{ t('management.title') }}</p>
        <p class="truncate text-xs text-subtle">{{ t('management.eyebrow') }}</p>
      </div>
    </div>
    <div
      class="mt-5 px-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-subtle max-md:hidden"
    >
      {{ t('management.navigationLabel') }}
    </div>
    <nav class="mt-2 space-y-1" :aria-label="t('management.navigationLabel')">
      <TeaButton
        v-for="section in MANAGEMENT_SECTIONS"
        :key="section.id"
        appearance="ghost"
        class="management-nav-row group flex min-h-11 w-full items-center justify-start gap-3 px-2.5 py-2 text-left max-md:justify-center max-md:px-0"
        :class="
          activeSection === section.id
            ? 'bg-canvas text-fg ring-1 ring-line-soft'
            : 'text-dim hover:bg-canvas hover:text-fg'
        "
        :aria-current="activeSection === section.id ? 'page' : undefined"
        :aria-label="t(section.labelKey)"
        :title="t(section.descriptionKey)"
        @click="emit('select', section.id)"
      >
        <span
          :class="[
            section.icon,
            'size-[1.125rem] shrink-0',
            activeSection === section.id ? 'text-fg' : 'text-subtle group-hover:text-dim',
          ]"
          aria-hidden="true"
        />
        <span class="min-w-0 truncate text-sm font-medium max-md:hidden">{{
          t(section.labelKey)
        }}</span>
        <span
          v-if="activeSection === section.id"
          class="ml-auto size-1.5 shrink-0 rounded-full bg-brand-accent"
          aria-hidden="true"
        />
      </TeaButton>
    </nav>
    <div
      class="mt-auto border-t border-line-soft px-2.5 pt-4 max-md:flex max-md:justify-center max-md:px-0"
    >
      <div class="flex items-center gap-2 text-xs font-medium text-dim">
        <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
        <span class="max-md:hidden">{{ t('management.profileStatus') }}</span>
      </div>
      <p class="mt-2 text-xs leading-4 text-subtle max-md:hidden">
        {{ t('management.localOnly') }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.management-nav-row {
  border-radius: var(--tea-radius-inline);
}
</style>
