import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SkillRecord } from './contracts'
import { listSkills } from '@/infrastructure/skills/electronSkillClient'

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<SkillRecord[]>([])
  const loading = ref(false)
  async function initialize(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      skills.value = await listSkills()
    } finally {
      loading.value = false
    }
  }
  function setEnabled(skill: SkillRecord, enabled: boolean): void {
    skill.enabled = enabled
  }
  return { skills, loading, initialize, setEnabled }
})
