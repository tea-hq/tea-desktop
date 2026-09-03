<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TeaButton, TeaDialog, TeaIconButton, TeaInput, TeaTextarea } from '@/shared/ui'
import type { Channel, ChannelDetails, ChannelMember } from '../contracts'

const emit = defineEmits<{
  close: []
  loadMore: []
  retry: []
  updateGroup: [payload: { name: string; description: string; announcement: string }]
  inviteMembers: [accountIds: string[]]
  removeMember: [accountId: string]
  toggleMemberMute: [member: ChannelMember]
  toggleMemberRole: [member: ChannelMember]
}>()
const { t } = useI18n()
const editing = ref(false)
const editName = ref('')
const editDescription = ref('')
const editAnnouncement = ref('')
const inviteDraft = ref('')

const props = defineProps<{
  open: boolean
  channel: Channel | null
  details: ChannelDetails | null
  members: ChannelMember[]
  loading: boolean
  hasMore: boolean
  errorCode: string | null
  actionPending?: boolean
}>()

watch(
  () => [props.channel?.name, props.details?.description, props.details?.announcement] as const,
  ([name, description, announcement]) => {
    editName.value = name ?? ''
    editDescription.value = description ?? ''
    editAnnouncement.value = announcement ?? ''
  },
  { immediate: true },
)

function initials(name: string): string {
  return [...name].slice(0, 2).join('').toUpperCase()
}

function roleLabel(role: ChannelMember['role']): string {
  return t(`channels.details.roles.${role}`)
}

function saveGroup(): void {
  if (!editName.value.trim()) return
  emit('updateGroup', {
    name: editName.value.trim(),
    description: editDescription.value.trim(),
    announcement: editAnnouncement.value.trim(),
  })
  editing.value = false
}

function inviteMembers(): void {
  const accountIds = [
    ...new Set(
      inviteDraft.value
        .split(/[\s,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
  if (!accountIds.length) return
  emit('inviteMembers', accountIds)
  inviteDraft.value = ''
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="channel?.name ?? t('channels.details.title')"
    width="default"
    dismissable
    @close="emit('close')"
  >
    <div v-if="loading && !details" class="flex items-center gap-2 py-8 text-sm text-subtle">
      <span class="i-mdi-loading size-5 animate-spin" aria-hidden="true" />
      {{ t('channels.details.loading') }}
    </div>
    <div v-else-if="errorCode && !details" class="py-5">
      <p class="text-sm text-danger">{{ t('channels.details.loadFailed', { code: errorCode }) }}</p>
      <TeaButton class="mt-3" size="small" @click="emit('retry')">
        {{ t('channels.connection.retry') }}
      </TeaButton>
    </div>
    <template v-else>
      <div v-if="channel?.kind === 'group'" class="mb-4 flex items-center justify-end gap-2">
        <TeaButton
          size="small"
          appearance="ghost"
          :disabled="actionPending"
          @click="editing = !editing"
        >
          {{ editing ? t('channels.details.cancelEdit') : t('channels.details.edit') }}
        </TeaButton>
      </div>
      <div
        v-if="editing && channel?.kind === 'group'"
        class="mb-4 space-y-2 border-b border-line pb-4"
      >
        <TeaInput v-model="editName" :label="t('channels.details.name')" />
        <TeaTextarea
          v-model="editDescription"
          :label="t('channels.details.description')"
          :rows="2"
          auto-grow
        />
        <TeaTextarea
          v-model="editAnnouncement"
          :label="t('channels.details.announcement')"
          :rows="2"
          auto-grow
        />
        <div class="flex justify-end">
          <TeaButton
            size="small"
            appearance="primary"
            :disabled="actionPending || !editName.trim()"
            @click="saveGroup"
          >
            {{ t('channels.details.save') }}
          </TeaButton>
        </div>
      </div>
      <dl class="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-line pb-4 text-sm">
        <div>
          <dt class="text-xs text-subtle">{{ t('channels.details.description') }}</dt>
          <dd class="mt-1 text-fg">{{ details?.description || t('channels.details.empty') }}</dd>
        </div>
        <div>
          <dt class="text-xs text-subtle">{{ t('channels.details.members') }}</dt>
          <dd class="mt-1 text-fg">
            {{ details?.memberCount ?? channel?.memberCount ?? 0 }}
            <span v-if="details?.memberLimit" class="text-subtle">
              / {{ details.memberLimit }}</span
            >
          </dd>
        </div>
        <div v-if="details?.ownerAccountId">
          <dt class="text-xs text-subtle">{{ t('channels.details.owner') }}</dt>
          <dd class="mt-1 truncate text-fg">{{ details.ownerAccountId }}</dd>
        </div>
        <div v-if="details?.announcement" class="col-span-2">
          <dt class="text-xs text-subtle">{{ t('channels.details.announcement') }}</dt>
          <dd class="mt-1 whitespace-pre-wrap text-fg">{{ details.announcement }}</dd>
        </div>
      </dl>
      <div v-if="channel?.kind === 'group'" class="mt-4 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-fg">{{ t('channels.details.memberList') }}</h3>
        <span
          v-if="loading"
          class="i-mdi-loading size-4 animate-spin text-subtle"
          aria-hidden="true"
        />
      </div>
      <div v-if="channel?.kind === 'group'" class="mt-3 flex items-end gap-2">
        <TeaInput
          v-model="inviteDraft"
          class="min-w-0 flex-1"
          :label="t('channels.details.invitePlaceholder')"
        />
        <TeaButton
          size="small"
          appearance="secondary"
          :disabled="actionPending || !inviteDraft.trim()"
          @click="inviteMembers"
        >
          {{ t('channels.details.invite') }}
        </TeaButton>
      </div>
      <ul v-if="channel?.kind === 'group'" class="mt-2 divide-y divide-line border-y border-line">
        <li
          v-for="member in members"
          :key="member.accountId"
          class="flex items-center gap-3 py-2.5"
        >
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-dim"
          >
            {{ initials(member.name) }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-fg">{{ member.name }}</p>
            <p class="truncate text-xs text-subtle">{{ member.accountId }}</p>
          </div>
          <span class="shrink-0 text-xs text-subtle">{{ roleLabel(member.role) }}</span>
          <TeaIconButton
            v-if="member.role !== 'owner'"
            size="small"
            :label="t('channels.details.toggleRole')"
            :icon="
              member.role === 'manager' ? 'i-mdi-account-outline' : 'i-mdi-shield-account-outline'
            "
            :disabled="actionPending"
            @click="emit('toggleMemberRole', member)"
          />
          <TeaIconButton
            v-if="member.role !== 'owner'"
            size="small"
            :label="member.chatBanned ? t('channels.details.unmute') : t('channels.details.mute')"
            :icon="member.chatBanned ? 'i-mdi-microphone' : 'i-mdi-microphone-off'"
            :disabled="actionPending"
            @click="emit('toggleMemberMute', member)"
          />
          <TeaIconButton
            v-if="member.role !== 'owner'"
            size="small"
            :label="t('channels.details.removeMember')"
            icon="i-mdi-account-remove-outline"
            :disabled="actionPending"
            @click="emit('removeMember', member.accountId)"
          />
          <span
            v-if="member.chatBanned"
            class="i-mdi-microphone-off size-4 text-warning"
            :title="t('channels.details.chatBanned')"
          />
        </li>
      </ul>
      <div
        v-if="channel?.kind === 'group' && !members.length && !loading"
        class="py-5 text-center text-sm text-subtle"
      >
        {{ t('channels.details.noMembers') }}
      </div>
      <div v-if="channel?.kind === 'group' && hasMore" class="mt-3 flex justify-center">
        <TeaButton size="small" appearance="ghost" :disabled="loading" @click="emit('loadMore')">
          {{ t('channels.details.loadMore') }}
        </TeaButton>
      </div>
    </template>
    <template #footer>
      <TeaIconButton
        :label="t('channels.message.cancel')"
        icon="i-mdi-close"
        @click="emit('close')"
      />
    </template>
  </TeaDialog>
</template>
