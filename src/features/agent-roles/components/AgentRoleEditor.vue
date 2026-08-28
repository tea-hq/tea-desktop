<script setup lang="ts">
import { TeaButton, TeaInput, TeaTextarea } from '@/shared/ui'
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SegmentedChoice from '@/shared/ui/SegmentedChoice.vue'
import CapabilityReferenceList from '@/shared/ui/CapabilityReferenceList.vue'
import type {
  AgentRoleDraft,
  AgentRoleRecord,
  AgentRoleVisibility,
  CapabilityReference,
} from '../contracts'

const props = defineProps<{ role?: AgentRoleRecord | null; saving?: boolean }>()
const emit = defineEmits<{ save: [draft: AgentRoleDraft]; cancel: [] }>()
const { t } = useI18n()
const form = reactive<AgentRoleDraft>({
  name: '',
  description: '',
  runtimeId: 'external.claude',
  modelId: '',
  systemPrompt: '',
  userPromptTemplate: '',
  visibility: 'private',
  audienceRefs: [],
  status: 'draft',
  capabilities: [],
  skills: [],
  plugins: [],
})
watch(
  () => props.role,
  (role) => {
    Object.assign(
      form,
      role
        ? { ...role, capabilities: [...(role.capabilities ?? [])] }
        : {
            name: '',
            description: '',
            runtimeId: 'external.claude',
            modelId: '',
            systemPrompt: '',
            userPromptTemplate: '',
            visibility: 'private',
            audienceRefs: [],
            status: 'draft',
            capabilities: [],
            skills: [],
            plugins: [],
          },
    )
  },
  { immediate: true },
)
const visibilityOptions = computed(() => [
  { value: 'private', label: t('management.agentRoles.visibility.private') },
  { value: 'tenant', label: t('management.agentRoles.visibility.tenant') },
  { value: 'restricted', label: t('management.agentRoles.visibility.restricted'), disabled: true },
])
const statusOptions = computed(() => [
  { value: 'draft', label: t('management.agentRoles.status.draft') },
  { value: 'published', label: t('management.agentRoles.status.published') },
])
function removeCapability(index: number) {
  form.capabilities?.splice(index, 1)
}
function addPlaceholder(kind: CapabilityReference['kind']) {
  form.capabilities?.push({
    kind,
    id: t('management.agentRoles.capability.pendingId'),
    available: false,
  })
}
function setVisibility(value: string) {
  form.visibility = value as AgentRoleVisibility
}
function setStatus(value: string) {
  form.status = value as AgentRoleDraft['status']
}
function submit() {
  if (!props.saving) emit('save', { ...form, capabilities: [...(form.capabilities ?? [])] })
}
</script>
<template>
  <form class="space-y-8" @submit.prevent="submit">
    <section>
      <h3 class="tea-text-caption tea-weight-strong uppercase tea-tracking-label tea-fg-subtle">
        {{ t('management.agentRoles.editor.basics') }}
      </h3>
      <div class="mt-4 space-y-4">
        <TeaInput
          v-model="form.name"
          required
          :label="t('management.agentRoles.fields.name')"
        /><TeaTextarea
          v-model="form.description"
          :rows="2"
          :label="t('management.agentRoles.fields.description')"
        />
        <div class="grid grid-cols-2 gap-3">
          <TeaInput
            v-model="form.runtimeId"
            :label="t('management.agentRoles.fields.runtime')"
          /><TeaInput
            :model-value="form.modelId ?? ''"
            :label="t('management.agentRoles.fields.model')"
            @update:model-value="form.modelId = $event"
          />
        </div>
      </div>
    </section>
    <section>
      <h3 class="tea-text-caption tea-weight-strong uppercase tea-tracking-label tea-fg-subtle">
        {{ t('management.agentRoles.editor.prompts') }}
      </h3>
      <div class="mt-4 space-y-4">
        <TeaTextarea
          :model-value="form.systemPrompt ?? ''"
          :rows="5"
          :label="t('management.agentRoles.fields.systemPrompt')"
          :placeholder="t('management.agentRoles.placeholders.systemPrompt')"
          @update:model-value="form.systemPrompt = $event"
        /><TeaTextarea
          :model-value="form.userPromptTemplate ?? ''"
          :rows="4"
          :label="t('management.agentRoles.fields.userPrompt')"
          :placeholder="t('management.agentRoles.placeholders.userPrompt')"
          @update:model-value="form.userPromptTemplate = $event"
        />
      </div>
    </section>
    <section>
      <div class="flex items-center justify-between">
        <h3 class="tea-text-caption tea-weight-strong uppercase tea-tracking-label tea-fg-subtle">
          {{ t('management.agentRoles.editor.capabilities') }}
        </h3>
        <span class="tea-text-caption tea-fg-subtle">{{
          t('management.agentRoles.editor.capabilitiesHint')
        }}</span>
      </div>
      <div class="mt-4">
        <CapabilityReferenceList :items="form.capabilities ?? []" @remove="removeCapability" />
        <div class="mt-3 flex gap-2">
          <TeaButton
            type="button"
            class="tea-radius-control tea-bg-muted px-3 py-2 tea-text-caption tea-fg-muted tea-hover-bg-strong"
            @click="addPlaceholder('skill')"
            >+ Skill</TeaButton
          ><TeaButton
            type="button"
            class="tea-radius-control tea-bg-muted px-3 py-2 tea-text-caption tea-fg-muted tea-hover-bg-strong"
            @click="addPlaceholder('mcp')"
            >+ MCP</TeaButton
          ><TeaButton
            type="button"
            class="tea-radius-control tea-bg-muted px-3 py-2 tea-text-caption tea-fg-muted tea-hover-bg-strong"
            @click="addPlaceholder('tool')"
            >+ Tool</TeaButton
          >
        </div>
      </div>
    </section>
    <section>
      <h3 class="tea-text-caption tea-weight-strong uppercase tea-tracking-label tea-fg-subtle">
        {{ t('management.agentRoles.editor.visibility') }}
      </h3>
      <div class="mt-4 space-y-4">
        <SegmentedChoice
          :model-value="form.visibility ?? 'private'"
          :options="visibilityOptions"
          @update:model-value="setVisibility"
        />
        <p v-if="form.visibility === 'restricted'" class="tea-text-caption tea-fg-muted">
          {{ t('management.agentRoles.visibility.restrictedHint') }}
        </p>
        <SegmentedChoice
          :model-value="form.status ?? 'draft'"
          :options="statusOptions"
          @update:model-value="setStatus"
        />
      </div>
    </section>
    <div class="flex justify-end gap-2 pt-2">
      <TeaButton
        type="button"
        class="tea-radius-control px-3 py-2 tea-text-caption tea-weight-medium tea-fg-muted tea-hover-bg"
        :disabled="props.saving"
        @click="emit('cancel')"
        >{{ t('management.agentRoles.cancel') }}</TeaButton
      ><TeaButton
        type="submit"
        class="tea-radius-control tea-bg-inverse px-4 py-2 tea-text-caption tea-weight-medium tea-fg-inverse tea-hover-bg-inverse disabled:cursor-not-allowed tea-disabled-bg"
        :disabled="props.saving"
        :aria-busy="props.saving"
        >{{ props.saving ? t('management.saving') : t('management.agentRoles.save') }}</TeaButton
      >
    </div>
  </form>
</template>
