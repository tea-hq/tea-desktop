export type ManagementSection = 'credentials' | 'plugins' | 'skills' | 'agentRoles'

export interface ManagementSectionMeta {
  id: ManagementSection
  labelKey: string
  descriptionKey: string
  icon: string
}

export const MANAGEMENT_SECTIONS: ManagementSectionMeta[] = [
  { id: 'credentials', labelKey: 'management.credentials.title', descriptionKey: 'management.credentials.description', icon: 'i-mdi-key-chain-variant' },
  { id: 'plugins', labelKey: 'management.plugins.title', descriptionKey: 'management.plugins.description', icon: 'i-mdi-puzzle-outline' },
  { id: 'skills', labelKey: 'management.skills.title', descriptionKey: 'management.skills.description', icon: 'i-mdi-lightning-bolt-outline' },
  { id: 'agentRoles', labelKey: 'management.agentRoles.title', descriptionKey: 'management.agentRoles.description', icon: 'i-mdi-account-cog-outline' },
]
