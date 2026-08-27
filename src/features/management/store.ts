import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ManagementSection } from './contracts'

export const useManagementStore = defineStore('management', () => {
  const activeSection = ref<ManagementSection>('credentials')

  function selectSection(section: ManagementSection): void {
    activeSection.value = section
  }

  return { activeSection, selectSection }
})
