<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComposerProfile } from '@/app/composerProfiles'
import { TeaIconButton, TeaInput, TeaMenuSelect, TeaTextarea } from '@/shared/ui'
import ChannelSourceTray from '@/features/collaboration/components/ChannelSourceTray.vue'
import type { ChannelSourceInput } from '@/types/channelCollaboration'
import type {
  ComposerAttachment,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
} from '../contracts'
import { shouldSendFromComposer } from '../composerKeyboard'
import AgentModelMenu from './AgentModelMenu.vue'

const props = defineProps<{
  profile: ComposerProfile
  centered?: boolean
  text: string
  attachments: ComposerAttachment[]
  workingDirectory?: string | null
  newConversation?: boolean
  sources?: ChannelSourceInput[]
  runtimes: RuntimeDescriptor[]
  runtimeId: string | null
  modelOptions: ModelOption[]
  model: string
  permissionMode: PermissionMode
  disabled?: boolean
  streaming?: boolean
}>()
const emit = defineEmits<{
  'update:text': [value: string]
  'update:attachments': [value: ComposerAttachment[]]
  'update:workingDirectory': [value: string | null]
  selectRuntime: [value: string]
  selectModel: [value: string]
  selectPermission: [value: PermissionMode]
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
    disabled: value.unavailable,
  })),
)
const permissions = computed(() =>
  (['default', 'readOnly', 'fullAccess'] as const).map((value) => ({
    value,
    label: t(`composer.permission.${value}.label`),
  })),
)

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
function removeAttachment(id: string): void {
  emit(
    'update:attachments',
    props.attachments.filter((value) => value.id !== id).map((value) => ({ ...value })),
  )
}
function focus(): void {
  void nextTick(() => document.querySelector<HTMLTextAreaElement>('[data-agent-composer]')?.focus())
}
defineExpose({ focus })
</script>

<template>
  <footer
    class="agent-composer shrink-0 px-3 py-3 sm:px-5 sm:py-4"
    :class="centered ? 'agent-composer--centered' : ''"
  >
    <div class="mx-auto w-full max-w-3xl">
      <ChannelSourceTray
        v-if="profile.showSources"
        :sources="sources ?? []"
        @remove="emit('removeSource', $event)"
      />
      <div v-if="attachments.length" class="attachment-list" aria-live="polite">
        <div v-for="item in attachments" :key="item.id" class="attachment-chip">
          <span class="attachment-chip__name">{{ item.name }}</span>
          <button
            type="button"
            class="attachment-chip__remove"
            :aria-label="`${t('composer.removeAttachment')}: ${item.name}`"
            :title="t('composer.removeAttachment')"
            @click="removeAttachment(item.id)"
          >
            <span class="i-mdi-close size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div v-if="newConversation && profile.id === 'full'" class="working-directory-control">
        <span class="i-mdi-folder-outline size-4 text-subtle" aria-hidden="true" />
        <TeaInput
          class="working-directory-control__input"
          size="small"
          :model-value="workingDirectory ?? ''"
          :placeholder="t('composer.workingDirectoryPlaceholder')"
          :label="t('composer.workingDirectory')"
          :disabled="disabled || streaming"
          @update:model-value="emit('update:workingDirectory', $event)"
        />
        <TeaIconButton
          v-if="workingDirectory"
          size="small"
          :label="t('composer.clearWorkingDirectory')"
          icon="i-mdi-close"
          @click="emit('update:workingDirectory', null)"
        />
      </div>
      <div class="composer-shell" :class="profile.compact ? 'composer-shell--compact' : ''">
        <TeaTextarea
          data-agent-composer
          class="composer-input"
          auto-grow
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
        <div class="composer-toolbar">
          <input ref="fileInput" type="file" multiple class="hidden" @change="files" />
          <div class="composer-toolbar-controls">
            <TeaIconButton
              size="small"
              :label="t('composer.addFiles')"
              icon="i-mdi-paperclip"
              @click="fileInput?.click()"
            />
            <TeaMenuSelect
              v-if="profile.showRuntimeSelect"
              class="composer-menu-select composer-menu-select--runtime"
              :model-value="runtimeId"
              :options="runtimeOptions"
              :label="t('composer.selectAgent')"
              size="small"
              menu-placement="up"
              :disabled="disabled || streaming"
              @update:model-value="$event && emit('selectRuntime', String($event))"
            />
            <TeaMenuSelect
              class="composer-menu-select composer-menu-select--permission"
              :model-value="permissionMode"
              :options="permissions"
              :label="t('composer.selectPermission')"
              size="small"
              menu-placement="up"
              :disabled="disabled || streaming"
              :class="`composer-permission--${permissionMode}`"
              @update:model-value="$event && emit('selectPermission', $event as PermissionMode)"
            />
          </div>
          <div class="composer-toolbar-actions">
            <AgentModelMenu
              class="composer-menu-select composer-menu-select--model"
              :model-value="model"
              :options="models"
              :label="t('composer.selectModel')"
              :disabled="disabled || streaming"
              @update:model-value="$event && emit('selectModel', String($event))"
            />
            <TeaIconButton
              v-if="streaming"
              class="composer-submit"
              :label="t('composer.stop')"
              icon="i-mdi-stop"
              appearance="danger"
              @click="emit('stop')"
            />
            <TeaIconButton
              v-else
              :label="t('composer.send')"
              icon="i-mdi-arrow-up"
              appearance="primary"
              :disabled="disabled || !text.trim()"
              @click="submit"
            />
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.agent-composer {
  border-top: 1px solid var(--tea-line-soft);
  background: var(--tea-panel);
}
.agent-composer--centered {
  padding-block: 0.75rem 1.5rem;
}
.agent-composer--centered .composer-shell {
  border-color: var(--tea-line);
  padding: 1rem;
}
.composer-shell {
  border: 1px solid var(--tea-line-soft);
  border-radius: var(--tea-radius-card);
  background: var(--tea-canvas);
  padding: 0.75rem;
}
.working-directory-control {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  margin-bottom: 0.5rem;
  border: 1px solid var(--tea-line-soft);
  border-radius: var(--tea-radius-inline);
  background: var(--tea-panel);
  padding: 0.25rem 0.375rem 0.25rem 0.625rem;
}
.working-directory-control :deep(.working-directory-control__input) {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--tea-fg);
  font-size: 0.75rem;
  line-height: 1.5;
}
.working-directory-control :deep(.working-directory-control__input::placeholder) {
  color: var(--tea-subtle);
}
.composer-input {
  min-height: 4.5rem;
  max-height: 12rem;
  resize: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  box-shadow: none;
}
.composer-input:focus {
  border-color: transparent;
  box-shadow: none;
  outline: none;
}
.composer-shell--compact .composer-input {
  min-height: 3rem;
  max-height: 8rem;
}
.attachment-list {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.125rem;
}
.attachment-chip {
  display: inline-flex;
  min-width: 0;
  max-width: 16rem;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
  border: 1px solid var(--tea-line);
  border-radius: var(--tea-radius-pill);
  background: var(--tea-panel);
  padding: 0.25rem 0.375rem 0.25rem 0.625rem;
  color: var(--tea-dim);
  font-size: 0.75rem;
  line-height: 1.25;
}
.attachment-chip__name {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachment-chip__remove {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: var(--tea-radius-pill);
  color: var(--tea-subtle);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}
.attachment-chip__remove:hover {
  background: var(--tea-hover);
  color: var(--tea-fg);
}
.attachment-chip__remove:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}
.composer-toolbar {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.625rem;
}
.composer-toolbar-controls,
.composer-toolbar-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
}
.composer-toolbar-controls {
  flex: 1 1 auto;
  flex-wrap: wrap;
}
.composer-toolbar-actions {
  margin-left: auto;
}
.composer-menu-select {
  flex: 0 1 auto;
  min-width: 0;
}
.composer-menu-select--runtime {
  max-width: 10rem;
}
.composer-menu-select--model {
  max-width: 24rem;
}
.composer-menu-select--permission {
  max-width: 9rem;
}
.composer-menu-select :deep(.tea-menu-select__trigger) {
  color: var(--tea-dim);
}
.composer-menu-select :deep(.tea-menu-select__trigger:hover),
.composer-menu-select :deep(.tea-menu-select__trigger:focus-visible) {
  color: var(--tea-fg);
}
.composer-permission--fullAccess :deep(.tea-menu-select__trigger) {
  color: var(--tea-warning);
}
.composer-permission--readOnly :deep(.tea-menu-select__trigger) {
  color: var(--tea-subtle);
}
.composer-submit {
  margin-bottom: 0.125rem;
}

@media (max-width: 40rem) {
  .agent-composer {
    padding: 0.625rem 0.75rem;
  }
  .agent-composer--centered {
    padding-block: 0.5rem 1rem;
  }
  .composer-shell {
    padding: 0.625rem;
  }
  .composer-toolbar-actions {
    flex: 1 1 100%;
    justify-content: space-between;
    margin-left: 0;
  }
  .composer-toolbar-controls {
    flex-basis: 100%;
  }
  .composer-menu-select {
    flex: 1 1 0;
    max-width: none;
  }
  .composer-menu-select--model {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .attachment-chip__remove,
  .composer-shell {
    transition: none;
  }
}
</style>
