<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComposerProfile } from '@/app/composerProfiles'
import { TeaIconButton, TeaSelect, TeaTextarea } from '@/shared/ui'
import ChannelSourceTray from '@/features/collaboration/components/ChannelSourceTray.vue'
import type { ChannelSourceInput } from '@/types/channelCollaboration'
import type {
  AgentRoleOption,
  ComposerAttachment,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '../contracts'
import { shouldSendFromComposer } from '../composerKeyboard'

const props = defineProps<{
  profile: ComposerProfile
  text: string
  attachments: ComposerAttachment[]
  sources?: ChannelSourceInput[]
  runtimes: RuntimeDescriptor[]
  runtimeId: string | null
  modelOptions: ModelOption[]
  model: string
  permissionMode: PermissionMode
  roles?: AgentRoleOption[]
  roleId?: string | null
  disabled?: boolean
  streaming?: boolean
}>()
const emit = defineEmits<{
  'update:text': [value: string]
  'update:attachments': [value: ComposerAttachment[]]
  selectRuntime: [value: string]
  selectModel: [value: string]
  selectPermission: [value: PermissionMode]
  selectRole: [value: string | null]
  removeSource: [messageClientId: string]
  send: [payload: { text: string; attachments: ComposerAttachment[] }]
  stop: []
}>()
const fileInput = ref<HTMLInputElement | null>(null)
const composing = ref(false)
const { t } = useI18n()
const runtimeOptions = computed(() =>
  props.runtimes.map((value) => ({
    value: value.id,
    label: value.displayName,
    disabled: value.status !== 'ready',
  })),
)
const models = computed(() =>
  props.modelOptions.map((value) => ({
    value: value.value,
    label: value.label ?? (value.labelKey ? t(value.labelKey) : value.value),
  })),
)
const permissions = computed(() =>
  (['default', 'readOnly', 'fullAccess'] as const).map((value) => ({
    value,
    label: t(`composer.permission.${value}.label`),
  })),
)
const roleOptions = computed(() => [
  { value: '', label: t('composer.role.default') },
  ...(props.roles ?? []).map((value) => ({ value: value.id, label: value.name })),
])

function submit(): void {
  const text = props.text.trim()
  if (!text || props.disabled || props.streaming) return
  emit('send', { text, attachments: props.attachments.map((value) => ({ ...value })) })
}
function keydown(event: KeyboardEvent): void {
  if (shouldSendFromComposer(event, composing.value)) {
    event.preventDefault()
    submit()
  }
}
function files(event: Event): void {
  const input = event.target as HTMLInputElement
  const next = [
    ...props.attachments,
    ...Array.from(input.files ?? []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
    })),
  ]
  emit(
    'update:attachments',
    next
      .filter((value, index) => next.findIndex((candidate) => candidate.id === value.id) === index)
      .slice(0, props.profile.maxAttachments),
  )
  input.value = ''
}
function focus(): void {
  void nextTick(() => document.querySelector<HTMLTextAreaElement>('[data-agent-composer]')?.focus())
}
defineExpose({ focus })
</script>

<template>
  <footer class="agent-composer shrink-0 p-3">
    <ChannelSourceTray
      v-if="profile.showSources"
      :sources="sources ?? []"
      @remove="emit('removeSource', $event)"
    />
    <div v-if="attachments.length" class="mb-2 flex gap-1 overflow-x-auto">
      <span v-for="item in attachments" :key="item.id" class="attachment-chip">{{
        item.name
      }}</span>
    </div>
    <TeaTextarea
      data-agent-composer
      :model-value="text"
      :label="t('composer.placeholder')"
      :rows="profile.compact ? 2 : 3"
      :disabled="disabled"
      :placeholder="t('composer.placeholder')"
      @update:model-value="emit('update:text', $event)"
      @keydown="keydown"
      @compositionstart="composing = true"
      @compositionend="composing = false"
    />
    <div class="composer-toolbar mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      <input ref="fileInput" type="file" multiple class="hidden" @change="files" />
      <TeaIconButton
        :label="t('composer.addFiles')"
        icon="i-mdi-paperclip"
        @click="fileInput?.click()"
      />
      <TeaSelect
        :model-value="runtimeId"
        :options="runtimeOptions"
        :label="t('composer.selectAgent')"
        size="small"
        @update:model-value="$event && emit('selectRuntime', String($event))"
      />
      <TeaSelect
        :model-value="model"
        :options="models"
        :label="t('composer.selectModel')"
        size="small"
        @update:model-value="$event && emit('selectModel', String($event))"
      />
      <TeaSelect
        :model-value="permissionMode"
        :options="permissions"
        :label="t('composer.selectPermission')"
        size="small"
        @update:model-value="$event && emit('selectPermission', $event as PermissionMode)"
      />
      <TeaSelect
        v-if="roleOptions.length > 1"
        :model-value="roleId ?? ''"
        :options="roleOptions"
        :label="t('composer.selectRole')"
        size="small"
        @update:model-value="emit('selectRole', $event ? String($event) : null)"
      />
      <span class="flex-1" />
      <TeaIconButton
        v-if="streaming"
        :label="t('composer.stop')"
        icon="i-mdi-stop"
        appearance="danger"
        @click="emit('stop')"
      />
      <TeaIconButton
        v-else
        :label="t('composer.send')"
        icon="i-mdi-arrow-up"
        :disabled="disabled || !text.trim()"
        @click="submit"
      />
    </div>
  </footer>
</template>

<style scoped>
.agent-composer {
  border-top: 1px solid var(--p-content-border-color);
  background: var(--p-surface-50);
}
.attachment-chip {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--p-border-radius-sm);
  background: var(--p-surface-100);
  padding: 0.25rem 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
.composer-toolbar :deep(.p-select) {
  min-width: 0;
  flex: 1 1 7rem;
}
</style>
