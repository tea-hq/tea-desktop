<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentRoleOption } from '../contracts'

const props = defineProps<{
  roles: AgentRoleOption[]
  runtimeId: string | null
  roleId?: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  selectRole: [value: string]
  applyPrompt: [value: string]
}>()

const { t } = useI18n()
const collapsedRoleLimit = 3
const expanded = ref(false)
const availableRoles = computed(() => {
  if (!props.runtimeId) return []
  return props.roles.filter((role) => role.runtimeId === props.runtimeId)
})
const selectedRole = computed(() => availableRoles.value.find((role) => role.id === props.roleId))
const visibleRoles = computed(() => {
  if (expanded.value || availableRoles.value.length <= collapsedRoleLimit)
    return availableRoles.value
  const collapsed = availableRoles.value.slice(0, collapsedRoleLimit)
  if (selectedRole.value && !collapsed.some((role) => role.id === selectedRole.value?.id)) {
    return [selectedRole.value, ...collapsed.slice(0, collapsedRoleLimit - 1)]
  }
  return collapsed
})
const hiddenRoleCount = computed(() => availableRoles.value.length - visibleRoles.value.length)
const hasMoreRoles = computed(() => availableRoles.value.length > collapsedRoleLimit)
const promptPreview = computed(() => {
  const prompt = selectedRole.value?.prompt?.trim()
  return prompt || t('composer.rolePicker.noPrompt')
})

function selectRole(role: AgentRoleOption): void {
  if (!props.disabled) emit('selectRole', role.id)
}
function applyPrompt(): void {
  const prompt = selectedRole.value?.prompt?.trim()
  if (!props.disabled && prompt) emit('applyPrompt', prompt)
}
function toggleExpanded(): void {
  expanded.value = !expanded.value
}
watch(
  () => props.runtimeId,
  () => {
    expanded.value = false
  },
)
</script>

<template>
  <section
    v-if="availableRoles.length"
    class="role-picker mx-auto w-full max-w-3xl"
    :aria-label="t('composer.rolePicker.title')"
  >
    <div class="role-picker__header">
      <div class="role-picker__heading">
        <span class="i-mdi-account-star-outline size-4 text-subtle" aria-hidden="true" />
        <div>
          <p class="role-picker__eyebrow">{{ t('composer.rolePicker.eyebrow') }}</p>
          <h2 class="role-picker__title">{{ t('composer.rolePicker.title') }}</h2>
        </div>
      </div>
      <div class="role-picker__header-actions">
        <span class="role-picker__optional">
          {{ selectedRole ? t('composer.rolePicker.selected') : t('composer.rolePicker.optional') }}
        </span>
        <button
          v-if="hasMoreRoles"
          type="button"
          class="role-picker__toggle"
          :aria-expanded="expanded"
          @click="toggleExpanded"
        >
          <span>{{
            expanded
              ? t('composer.rolePicker.showLess')
              : t('composer.rolePicker.showMore', { count: hiddenRoleCount })
          }}</span>
          <span
            :class="expanded ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
            class="size-3.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <div class="role-picker__options">
      <button
        v-for="role in visibleRoles"
        :key="role.id"
        type="button"
        class="role-picker__option"
        :class="role.id === roleId ? 'role-picker__option--selected' : ''"
        :aria-label="role.name"
        :aria-pressed="role.id === roleId"
        :disabled="disabled"
        @click="selectRole(role)"
      >
        <span class="role-picker__option-top">
          <span class="role-picker__name">{{ role.name }}</span>
          <span
            v-if="role.id === roleId"
            class="i-mdi-check-circle size-4 text-accent"
            aria-hidden="true"
          />
        </span>
        <span class="role-picker__description">
          {{ role.description || t('composer.rolePicker.noDescription') }}
        </span>
        <span v-if="role.skills?.length" class="role-picker__skills">
          <span v-for="skill in role.skills.slice(0, 3)" :key="skill" class="role-picker__skill">
            {{ skill }}
          </span>
          <span v-if="role.skills.length > 3" class="role-picker__skill-more">
            +{{ role.skills.length - 3 }}
          </span>
        </span>
      </button>
    </div>

    <div v-if="selectedRole" class="role-picker__prompt">
      <div class="role-picker__prompt-copy">
        <span class="i-mdi-text-box-edit-outline size-4 text-subtle" aria-hidden="true" />
        <span class="role-picker__prompt-text" :title="promptPreview">{{ promptPreview }}</span>
      </div>
      <button
        type="button"
        class="role-picker__prompt-action"
        :disabled="disabled || !selectedRole.prompt?.trim()"
        @click="applyPrompt"
      >
        <span class="i-mdi-arrow-down-left-bold-outline size-3.5" aria-hidden="true" />
        {{ t('composer.rolePicker.usePrompt') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.role-picker {
  margin-top: 1.25rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--tea-line);
  border-radius: var(--tea-radius-card);
  background: var(--tea-panel);
  padding: 0.875rem;
}
.role-picker__header,
.role-picker__heading,
.role-picker__option-top,
.role-picker__prompt,
.role-picker__prompt-copy,
.role-picker__skills {
  display: flex;
  align-items: center;
}
.role-picker__header {
  justify-content: space-between;
  gap: 1rem;
}
.role-picker__header-actions {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.625rem;
}
.role-picker__heading {
  min-width: 0;
  gap: 0.5rem;
}
.role-picker__eyebrow {
  color: var(--tea-subtle);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-transform: uppercase;
}
.role-picker__title {
  margin-top: 0.125rem;
  color: var(--tea-fg);
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.25;
}
.role-picker__optional {
  color: var(--tea-subtle);
  font-size: 0.6875rem;
}
.role-picker__toggle {
  display: inline-flex;
  min-height: 1.75rem;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--tea-radius-inline);
  padding: 0.25rem 0.375rem;
  color: var(--tea-dim);
  font-size: 0.6875rem;
  font-weight: 650;
  white-space: nowrap;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}
.role-picker__toggle:hover {
  background: var(--tea-hover);
  color: var(--tea-fg);
}
.role-picker__toggle:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}
.role-picker__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.role-picker__option {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--tea-radius-inline);
  background: var(--tea-canvas);
  padding: 0.625rem 0.75rem;
  text-align: left;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}
.role-picker__option:hover {
  border-color: var(--tea-line);
  background: var(--tea-hover);
}
.role-picker__option:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}
.role-picker__option:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.role-picker__option--selected {
  border-color: var(--tea-fg);
  background: var(--tea-canvas);
}
.role-picker__option-top {
  justify-content: space-between;
  gap: 0.5rem;
}
.role-picker__name {
  min-width: 0;
  overflow: hidden;
  color: var(--tea-fg);
  font-size: 0.8125rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-picker__description {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 0.25rem;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.role-picker__skills {
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
}
.role-picker__skill,
.role-picker__skill-more {
  border-radius: var(--tea-radius-pill);
  background: var(--tea-panel);
  padding: 0.125rem 0.375rem;
  color: var(--tea-dim);
  font-size: 0.625rem;
  line-height: 1.3;
}
.role-picker__skill-more {
  background: transparent;
  color: var(--tea-subtle);
}
.role-picker__prompt {
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.75rem;
  border-top: 1px solid var(--tea-line-soft);
  padding-top: 0.625rem;
}
.role-picker__prompt-copy {
  min-width: 0;
  gap: 0.375rem;
}
.role-picker__prompt-text {
  min-width: 0;
  overflow: hidden;
  color: var(--tea-subtle);
  font-size: 0.75rem;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-picker__prompt-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--tea-radius-inline);
  padding: 0.25rem 0.5rem;
  color: var(--tea-fg);
  font-size: 0.6875rem;
  font-weight: 650;
  transition: background-color 150ms ease;
}
.role-picker__prompt-action:hover {
  background: var(--tea-hover);
}
.role-picker__prompt-action:focus-visible {
  outline: 2px solid var(--tea-focus);
  outline-offset: 1px;
}
.role-picker__prompt-action:disabled {
  cursor: not-allowed;
  color: var(--tea-disabled);
}
@media (max-width: 40rem) {
  .role-picker {
    margin-top: 1rem;
    margin-bottom: 1.25rem;
    padding: 0.75rem;
  }
  .role-picker__options {
    grid-template-columns: minmax(0, 1fr);
  }
  .role-picker__header {
    align-items: flex-start;
  }
  .role-picker__header-actions {
    align-items: flex-end;
    flex-direction: column;
    gap: 0.125rem;
  }
  .role-picker__prompt {
    align-items: flex-start;
    flex-direction: column;
  }
}
@media (prefers-reduced-motion: reduce) {
  .role-picker__option,
  .role-picker__prompt-action,
  .role-picker__toggle {
    transition: none;
  }
}
</style>
