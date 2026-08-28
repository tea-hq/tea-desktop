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
        <p class="text-sm font-medium text-subtle">
          {{ t('management.agentRoles.kicker') }}
        </p>
        <h2 class="mt-1 text-2xl font-semibold text-fg">
          {{ t('management.agentRoles.title') }}
        </h2>
        <p class="mt-2 max-w-xl text-base text-dim">
          {{ t('management.agentRoles.description') }}
        </p>
        <p v-if="store.error && !editorOpen" class="mt-3 text-sm text-danger" role="alert">
          {{ t(store.error) }}
        </p>
      </div>
      <TeaButton
        type="button"
        appearance="primary"
        class="inline-flex items-center gap-2 px-3 text-sm"
        @click="openCreate"
        ><span class="i-mdi-plus size-4" aria-hidden="true" />{{
          t('management.agentRoles.create')
        }}</TeaButton
      >
    </header>
    <div class="min-h-0 flex-1 overflow-auto px-8 pb-8">
      <div
        v-if="store.loading"
        class="flex min-h-48 items-center justify-center text-base text-subtle"
      >
        {{ t('management.loading') }}
      </div>
      <div
        v-else-if="sortedRoles.length === 0"
        class="flex min-h-64 items-center justify-center rounded-card bg-muted text-center"
      >
        <div>
          <span class="i-mdi-account-cog-outline mx-auto size-9 text-disabled" aria-hidden="true" />
          <p class="mt-3 text-base font-medium text-dim">
            {{ t('management.agentRoles.emptyTitle') }}
          </p>
          <p class="mt-1 max-w-sm text-sm leading-5 text-subtle">
            {{ t('management.agentRoles.emptyDescription') }}
          </p>
        </div>
      </div>
      <div v-else class="grid gap-3 md:grid-cols-2">
        <article
          v-for="(role, index) in sortedRoles"
          :key="role.id"
          class="animate-fade-slide group rounded-card bg-muted p-6 transition-colors hover:bg-hover"
          :style="{ animationDelay: `${index * 40}ms` }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="truncate text-base font-semibold text-fg">{{ role.name }}</h3>
              <p class="mt-1 line-clamp-2 text-sm leading-5 text-subtle">
                {{ role.description || t('management.agentRoles.noDescription') }}
              </p>
            </div>
            <span class="shrink-0 font-mono text-sm text-subtle">rev {{ role.revision }}</span>
          </div>
          <div class="mt-4 flex items-center gap-2 text-sm text-subtle">
            <span class="rounded-structural bg-canvas px-2 py-1">{{
              role.visibility ?? 'private'
            }}</span
            ><span class="rounded-structural bg-canvas px-2 py-1">{{ role.status ?? 'draft' }}</span
            ><span
              v-if="role.capabilities?.some((cap) => cap.available === false)"
              class="text-danger"
              >{{ t('management.agentRoles.unavailable') }}</span
            ><TeaButton
              type="button"
              class="ml-auto inline-flex size-7 items-center justify-center rounded-structural text-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover:opacity-100"
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
        class="mb-5 rounded-card bg-danger-subtle px-3 py-2 text-sm leading-5 text-danger"
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
