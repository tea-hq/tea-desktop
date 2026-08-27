import { ref, type Ref } from 'vue'
import type { WorkspaceMode } from '@/app/components/WorkspaceRail.vue'
import type { ComposerAttachment } from '@/features/conversation/contracts'

export interface WorkspaceUiState {
  activeMode: Ref<WorkspaceMode>
  previousMode: Ref<Exclude<WorkspaceMode, 'settings' | 'management' | 'profile'>>
  collaborationWorkspace: Ref<boolean>
  selectedRoleId: Ref<string | null>
  localComposerText: Ref<string>
  localComposerAttachments: Ref<ComposerAttachment[]>
  draftDialogId: Ref<string | null>
  logoutPending: Ref<boolean>
  directoryActionError: Ref<string | null>
}

export function createWorkspaceUiState(): WorkspaceUiState {
  return {
    activeMode: ref<WorkspaceMode>('channels'),
    previousMode: ref<Exclude<WorkspaceMode, 'settings' | 'management' | 'profile'>>('channels'),
    collaborationWorkspace: ref(false),
    selectedRoleId: ref(null),
    localComposerText: ref(''),
    localComposerAttachments: ref([]),
    draftDialogId: ref(null),
    logoutPending: ref(false),
    directoryActionError: ref(null),
  }
}
