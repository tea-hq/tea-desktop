<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentRolesStore } from '../store'
import type { AgentRoleDraft, AgentRoleRecord } from '../contracts'
import EditorDrawer from '@/shared/ui/EditorDrawer.vue'
import AgentRoleEditor from './AgentRoleEditor.vue'
const store = useAgentRolesStore()
const { t } = useI18n()
const editing = ref<AgentRoleRecord | null>(null)
const editorOpen = ref(false)
const sortedRoles = computed(() => [...store.roles].sort((a, b) => a.name.localeCompare(b.name)))
onMounted(() => {
  void store.initialize()
})
function openCreate() {
  store.clearError()
  editing.value = null
  editorOpen.value = true
}
function openEdit(role: AgentRoleRecord) {
  store.clearError()
  editing.value = role
  editorOpen.value = true
}
async function save(draft: AgentRoleDraft) {
  const id = draft.id ?? `local-role-${Date.now()}`
  const saved = await store.save({ ...draft, id })
  if (saved) editorOpen.value = false
}
</script>
<template>
  <section class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="flex items-start justify-between px-8 py-7">
      <div>
        <p class="tea-text-caption tea-weight-medium tea-fg-subtle">
          {{ t('management.agentRoles.kicker') }}
        </p>
        <h2 class="mt-1 tea-text-heading tea-weight-strong tea-tracking-label tea-fg">
          {{ t('management.agentRoles.title') }}
        </h2>
        <p class="mt-2 max-w-xl tea-text-body tea-fg-muted">
          {{ t('management.agentRoles.description') }}
        </p>
        <p
          v-if="store.error && !editorOpen"
          class="mt-3 tea-text-caption tea-fg-danger"
          role="alert"
        >
          {{ t(store.error) }}
        </p>
      </div>
      <TeaButton
        type="button"
        class="inline-flex items-center gap-2 tea-radius-control tea-bg-inverse px-3 py-2 tea-text-caption tea-weight-medium tea-fg-inverse tea-hover-bg-inverse"
        @click="openCreate"
        ><span class="i-mdi-plus size-4" aria-hidden="true" />{{
          t('management.agentRoles.create')
        }}</TeaButton
      >
    </header>
    <div class="min-h-0 flex-1 overflow-auto px-8 pb-8">
      <div
        v-if="store.loading"
        class="flex min-h-48 items-center justify-center tea-text-body tea-fg-subtle"
      >
        {{ t('management.loading') }}
      </div>
      <div
        v-else-if="sortedRoles.length === 0"
        class="flex min-h-64 items-center justify-center tea-bg-subtle text-center"
      >
        <div>
          <span
            class="i-mdi-account-cog-outline mx-auto size-9 tea-fg-disabled"
            aria-hidden="true"
          />
          <p class="mt-3 tea-text-body tea-weight-medium tea-fg-muted">
            {{ t('management.agentRoles.emptyTitle') }}
          </p>
          <p class="mt-1 max-w-sm tea-text-caption leading-5 tea-fg-subtle">
            {{ t('management.agentRoles.emptyDescription') }}
          </p>
        </div>
      </div>
      <div v-else class="grid gap-3 md:grid-cols-2">
        <article
          v-for="(role, index) in sortedRoles"
          :key="role.id"
          class="animate-fade-slide group tea-bg-subtle p-4 transition-colors tea-hover-bg"
          :style="{ animationDelay: `${index * 40}ms` }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="truncate tea-text-body tea-weight-strong tea-fg">{{ role.name }}</h3>
              <p class="mt-1 line-clamp-2 tea-text-caption leading-5 tea-fg-subtle">
                {{ role.description || t('management.agentRoles.noDescription') }}
              </p>
            </div>
            <span class="shrink-0 tea-mono tea-text-caption tea-fg-subtle"
              >rev {{ role.revision }}</span
            >
          </div>
          <div class="mt-4 flex items-center gap-2 tea-text-caption tea-fg-subtle">
            <span class="tea-radius-small tea-bg-canvas px-2 py-1">{{
              role.visibility ?? 'private'
            }}</span
            ><span class="tea-radius-small tea-bg-canvas px-2 py-1">{{
              role.status ?? 'draft'
            }}</span
            ><span
              v-if="role.capabilities?.some((cap) => cap.available === false)"
              class="tea-fg-danger"
              >{{ t('management.agentRoles.unavailable') }}</span
            ><TeaButton
              type="button"
              class="ml-auto inline-flex size-7 items-center justify-center tea-radius-small tea-fg-subtle opacity-0 transition-opacity tea-hover-bg tea-hover-fg group-hover:opacity-100"
              :title="t('management.agentRoles.edit')"
              @click="openEdit(role)"
              ><span class="i-mdi-pencil-outline size-4" aria-hidden="true"
            /></TeaButton>
          </div>
        </article>
      </div>
    </div>
    <EditorDrawer
      :open="editorOpen"
      :title="
        editing ? t('management.agentRoles.editTitle') : t('management.agentRoles.createTitle')
      "
      @close="editorOpen = false"
      ><div
        v-if="store.error"
        class="mb-5 tea-radius-control tea-bg-danger-subtle px-3 py-2 tea-text-caption leading-5 tea-fg-danger"
        role="alert"
      >
        {{ t(store.error) }}
      </div>
      <AgentRoleEditor
        :role="editing"
        :saving="store.saving"
        @save="save"
        @cancel="editorOpen = false"
    /></EditorDrawer>
  </section>
</template>
