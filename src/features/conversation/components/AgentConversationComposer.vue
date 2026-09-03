<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComposerProfile } from '@/app/composerProfiles'
import { TeaIconButton, TeaMenuSelect, TeaTextarea } from '@/shared/ui'
import ChannelSourceTray from '@/features/collaboration/components/ChannelSourceTray.vue'
import type { ChannelSourceInput } from '@/types/channelCollaboration'
import type {
  ComposerAttachment,
  ModelOption,
  PermissionMode,
  RuntimeDescriptor,
  ThinkingEffort,
} from '../contracts'
import { shouldSendFromComposer } from '../composerKeyboard'
import AgentModelMenu from './AgentModelMenu.vue'
import AgentProjectMenu from './AgentProjectMenu.vue'
import type { AgentWorkMode } from './AgentWorkModeMenu.vue'
import AgentWorkModeMenu from './AgentWorkModeMenu.vue'
import AgentRunnerTagMenu from './AgentRunnerTagMenu.vue'
import type { CloudRunnerTag } from '../../../../packages/runner/src/protocol'

const props = defineProps<{
  profile: ComposerProfile
  centered?: boolean
  text: string
  attachments: ComposerAttachment[]
  workingDirectory?: string | null
  projectDirectories?: string[]
  agentMode?: AgentWorkMode
  runnerTags?: string[]
  cloudRunnerTags?: CloudRunnerTag[]
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
  'new-project': []
  'update:agentMode': [value: AgentWorkMode]
  'update:runnerTag': [value: string]
  selectRuntime: [value: string]
  selectModel: [value: string]
  selectPermission: [value: PermissionMode]
  removeSource: [messageClientId: string]
  send: [payload: { text: string; attachments: ComposerAttachment[] }]
  stop: []
}>()
const fileInput = ref<HTMLInputElement | null>(null)
const composing = ref(false)
const thinkingEffort = ref<ThinkingEffort>('extraHigh')
const { t } = useI18n()
const models = computed(() =>
  props.modelOptions.map((value) => ({
    value: value.value,
    label: value.label ?? (value.labelKey ? t(value.labelKey) : value.value),
    disabled: value.unavailable,
  })),
)
const effortOptions = computed(() =>
  (['light', 'medium', 'high', 'extraHigh', 'ultra'] as const).map((value) => ({
    value,
    label: t(`composer.modelMenu.effortOptions.${value}`),
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
    <div class="agent-composer__content mx-auto w-full">
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
      <div v-if="profile.id === 'full' && newConversation" class="agent-context-controls">
        <AgentProjectMenu
          v-if="(agentMode ?? 'local') === 'local'"
          :model-value="workingDirectory"
          :projects="projectDirectories"
          :label="t('composer.selectProject')"
          :placeholder="t('composer.chooseProject')"
          :new-project-label="t('composer.newProject')"
          :disabled="disabled || streaming || !newConversation"
          @update:model-value="emit('update:workingDirectory', $event)"
          @new-project="emit('new-project')"
        />
        <AgentWorkModeMenu
          :model-value="agentMode ?? 'local'"
          :label="t('composer.selectAgentMode')"
          :disabled="disabled || streaming"
          @update:model-value="emit('update:agentMode', $event)"
        />
        <AgentRunnerTagMenu
          v-if="(agentMode ?? 'local') === 'cloud'"
          :model-value="runnerTags?.[0] ?? null"
          :tags="cloudRunnerTags ?? []"
          :label="t('composer.selectRunnerTag')"
          :placeholder="t('composer.chooseRunnerTag')"
          :disabled="disabled || streaming"
          @update:model-value="emit('update:runnerTag', $event)"
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
        <div
          class="composer-toolbar"
          :class="newConversation ? 'composer-toolbar--new-conversation' : ''"
        >
          <input ref="fileInput" type="file" multiple class="hidden" @change="files" />
          <div class="composer-toolbar-controls">
            <TeaIconButton
              size="small"
              :label="t('composer.addFiles')"
              icon="i-mdi-paperclip"
              @click="fileInput?.click()"
            />
            <TeaMenuSelect
              class="composer-menu-select composer-menu-select--permission"
              :model-value="permissionMode"
              :options="permissions"
              :label="t('composer.selectPermission')"
              :icon="newConversation ? 'i-mdi-shield-check-outline' : undefined"
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
              :runtimes="runtimes"
              :runtime-id="runtimeId"
              :allow-runtime-selection="Boolean(newConversation)"
              :disabled="disabled || streaming"
              @select-runtime="$event && emit('selectRuntime', String($event))"
              @update:model-value="$event && emit('selectModel', String($event))"
            />
            <TeaMenuSelect
              v-if="newConversation"
              class="composer-menu-select composer-menu-select--effort"
              :model-value="thinkingEffort"
              :options="effortOptions"
              :label="t('composer.selectThinkingEffort')"
              icon="i-mdi-lightbulb-outline"
              size="small"
              menu-placement="up"
              :disabled="disabled || streaming"
              @update:model-value="thinkingEffort = $event as ThinkingEffort"
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
  background: var(--tea-canvas);
}
.agent-composer__content {
  max-width: var(--agent-conversation-content-width);
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
  transition: border-color 150ms ease;
}
.composer-shell:focus-within {
  border-color: var(--tea-line-strong);
}
.agent-context-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  margin: 0 1.5rem -0.75rem;
  padding: 0.5rem 0.75rem 1rem;
  border-radius: var(--tea-radius-card) var(--tea-radius-card) 0 0;
  background: var(--tea-panel);
}
.agent-context-controls :deep(.agent-context-pill),
.agent-context-controls :deep(.tea-menu-select__trigger) {
  background: var(--tea-panel);
}
.agent-context-controls :deep(.agent-work-mode-menu) {
  min-width: 5.75rem;
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
.composer-toolbar--new-conversation {
  align-items: center;
}
.composer-menu-select {
  flex: 0 1 auto;
  min-width: 0;
}
.composer-menu-select--model {
  max-width: 24rem;
}
.composer-menu-select--permission {
  max-width: 9rem;
}
.composer-menu-select--effort {
  max-width: 10rem;
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
  .agent-context-controls {
    margin-inline: 0.5rem;
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
