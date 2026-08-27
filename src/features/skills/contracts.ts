export interface SkillRecord {
  id: string
  version: string
  displayName: string
  description: string
  enabled: boolean
  source: 'builtIn' | 'local' | 'workspace'
}
