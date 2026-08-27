import { hasElectronBridge, invoke } from '../electronBridge'
import type { SkillRecord } from '@/features/skills/contracts'

export async function listSkills(): Promise<SkillRecord[]> {
  if (!hasElectronBridge()) return []
  return invoke<SkillRecord[]>('list_skills')
}
