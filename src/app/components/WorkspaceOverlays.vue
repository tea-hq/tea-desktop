<script setup lang="ts">
import DraftEditorDialog from '@/features/collaboration/components/DraftEditorDialog.vue'
import { useTeaDesktopAppContext } from '@/app/teaDesktopContext'

const {
  draftDialogId,
  dialogDraft,
  dialogDelivery,
  collaboration,
  collaborationErrorText,
  saveDialogDraft,
  deliverDialogDraft,
} = useTeaDesktopAppContext()
</script>

<template>
  <DraftEditorDialog
    :open="Boolean(draftDialogId)"
    :draft="dialogDraft"
    :delivery="dialogDelivery"
    :busy="collaboration.sending"
    :error-message="collaborationErrorText"
    @close="draftDialogId = null"
    @save="saveDialogDraft"
    @deliver="deliverDialogDraft"
  />
</template>
