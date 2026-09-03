<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaIconButton, TeaTextarea } from '@/shared/ui'
import EditorDrawer from '@/shared/ui/EditorDrawer.vue'
import type { AgentRoleDraft, AgentRoleRecord } from '../contracts'
import { useAgentRolesStore } from '../store'
import AgentRoleEditor from './AgentRoleEditor.vue'

interface RoleBrief {
  id: number
  text: string
}

const store = useAgentRolesStore()
const { t } = useI18n()
const editing = ref<AgentRoleRecord | null>(null)
const editorOpen = ref(false)
const brief = ref('')
const briefs = ref<RoleBrief[]>([])
const reviewing = ref(false)
const briefInput = ref<{ focus: () => void } | null>(null)
let briefSequence = 0

const sortedRoles = computed(() => [...store.roles].sort((a, b) => a.name.localeCompare(b.name)))
const promptExamples = computed(() => [
  t('management.agentRoles.examples.research'),
  t('management.agentRoles.examples.release'),
  t('management.agentRoles.examples.support'),
])

onMounted(() => {
  void store.initialize()
})

function openCreate(): void {
  store.clearError()
  brief.value = ''
  reviewing.value = false
  void nextTick(() => briefInput.value?.focus())
}

function openEdit(role: AgentRoleRecord): void {
  store.clearError()
  editing.value = role
  editorOpen.value = true
}

function queueBrief(): void {
  const text = brief.value.trim()
  if (!text) return
  briefSequence += 1
  briefs.value.push({ id: briefSequence, text })
  brief.value = ''
  reviewing.value = true
}

function removeBrief(id: number): void {
  briefs.value = briefs.value.filter((item) => item.id !== id)
  if (briefs.value.length === 0) reviewing.value = false
}

function useExample(example: string): void {
  brief.value = example
}

function statusLabel(role: AgentRoleRecord): string {
  const status = role.status ?? 'draft'
  return t(`management.agentRoles.status.${status}`)
}

async function save(draft: AgentRoleDraft): Promise<void> {
  const id = draft.id ?? `local-role-${Date.now()}`
  const saved = await store.save({ ...draft, id })
  if (saved) editorOpen.value = false
}
</script>

<template>
  <section class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="shrink-0 border-b border-line-soft px-6 py-6 lg:px-8">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            {{ t('management.agentRoles.kicker') }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="font-display text-3xl font-semibold text-fg">
              {{ t('management.agentRoles.title') }}
            </h2>
            <span
              class="rounded-full bg-brand-accent/10 px-2.5 py-1 text-xs font-semibold text-brand-accent"
            >
              {{ t('management.agentRoles.promptBadge') }}
            </span>
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-5 text-dim">
            {{ t('management.agentRoles.description') }}
          </p>
          <p
            v-if="store.error && !editorOpen"
            class="mt-3 flex gap-2 text-sm text-danger"
            role="alert"
          >
            <span class="i-mdi-alert-circle-outline size-4 shrink-0" aria-hidden="true" />
            {{ t(store.error) }}
          </p>
        </div>
        <TeaButton appearance="primary" size="small" class="shrink-0 px-3" @click="openCreate">
          <span class="i-mdi-plus size-4" aria-hidden="true" />
          {{ t('management.agentRoles.newBrief') }}
        </TeaButton>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-6 pb-8 pt-5 lg:px-8">
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <section class="min-w-0 rounded-card border border-line-soft bg-canvas">
          <div class="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <div>
              <p class="text-sm font-semibold text-fg">
                {{ t('management.agentRoles.savedRoles') }}
              </p>
              <p class="mt-0.5 text-xs text-subtle">
                {{ t('management.agentRoles.savedCount', { count: sortedRoles.length }) }}
              </p>
            </div>
            <span class="font-mono text-xs text-subtle">ROLE/01</span>
          </div>
          <div v-if="store.loading" class="space-y-3 px-4 py-5" aria-live="polite">
            <div v-for="index in 4" :key="index" class="flex animate-pulse items-center gap-3">
              <span class="size-9 rounded-full bg-muted" />
              <span class="flex-1 space-y-2">
                <span class="block h-3 w-1/3 rounded-full bg-muted" />
                <span class="block h-2.5 w-2/3 rounded-full bg-panel" />
              </span>
            </div>
          </div>
          <div
            v-else-if="sortedRoles.length === 0"
            class="flex min-h-72 items-center justify-center px-6 text-center"
          >
            <div>
              <span
                class="i-mdi-account-cog-outline mx-auto size-8 text-disabled"
                aria-hidden="true"
              />
              <p class="mt-3 text-sm font-semibold text-dim">
                {{ t('management.agentRoles.emptyTitle') }}
              </p>
              <p class="mt-1 max-w-xs text-xs leading-5 text-subtle">
                {{ t('management.agentRoles.emptyDescription') }}
              </p>
              <TeaButton appearance="secondary" size="small" class="mt-4 px-3" @click="openCreate">
                <span class="i-mdi-message-text-outline size-4" aria-hidden="true" />
                {{ t('management.agentRoles.newBrief') }}
              </TeaButton>
            </div>
          </div>
          <div v-else class="divide-y divide-line-soft">
            <article
              v-for="role in sortedRoles"
              :key="role.id"
              class="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel"
            >
              <TeaButton
                appearance="ghost"
                class="flex min-w-0 flex-1 !justify-start !rounded-none !border-transparent !px-0 !py-0 text-left"
                @click="openEdit(role)"
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent"
                  >{{ role.name.slice(0, 1).toUpperCase() }}</span
                >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-fg">{{ role.name }}</span>
                  <span class="mt-1 block truncate text-xs text-subtle">{{
                    role.description || t('management.agentRoles.noDescription')
                  }}</span>
                </span>
                <span class="hidden shrink-0 items-center gap-2 sm:flex">
                  <span class="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-subtle">{{
                    statusLabel(role)
                  }}</span>
                  <span class="font-mono text-xs text-subtle">rev {{ role.revision }}</span>
                </span>
              </TeaButton>
              <TeaIconButton
                :label="t('management.agentRoles.edit')"
                icon="i-mdi-pencil-outline"
                size="small"
                @click="openEdit(role)"
              />
            </article>
          </div>
        </section>

        <section
          class="min-w-0 rounded-card border border-line-soft bg-panel p-5"
          :class="reviewing ? 'ring-1 ring-brand-accent/30' : ''"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-fg">
                {{ t('management.agentRoles.studioTitle') }}
              </p>
              <p class="mt-1 text-xs leading-5 text-subtle">
                {{ t('management.agentRoles.studioDescription') }}
              </p>
            </div>
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
            >
              <span class="i-mdi-text-box-edit-outline size-5" aria-hidden="true" />
            </span>
          </div>
          <form class="mt-5" @submit.prevent="queueBrief">
            <label class="block text-xs font-medium text-dim">
              {{ t('management.agentRoles.briefLabel') }}
              <TeaTextarea
                ref="briefInput"
                v-model="brief"
                class="mt-1.5"
                :rows="5"
                auto-grow
                :label="t('management.agentRoles.briefLabel')"
                :placeholder="t('management.agentRoles.briefPlaceholder')"
              />
            </label>
            <div class="mt-3 flex flex-wrap gap-2">
              <TeaButton
                v-for="example in promptExamples"
                :key="example"
                type="button"
                appearance="ghost"
                size="small"
                class="max-w-full px-2.5 text-left text-xs"
                @click="useExample(example)"
              >
                {{ example }}
              </TeaButton>
            </div>
            <div
              class="mt-4 flex items-center justify-between gap-3 border-t border-line-soft pt-4"
            >
              <span class="text-xs text-subtle">{{ t('management.agentRoles.briefHint') }}</span>
              <TeaButton
                appearance="primary"
                size="small"
                :disabled="!brief.trim()"
                class="shrink-0 px-3"
              >
                <span class="i-mdi-plus-box-outline size-4" aria-hidden="true" />
                {{ t('management.agentRoles.queueBrief') }}
              </TeaButton>
            </div>
          </form>

          <div class="mt-6 border-t border-line-soft pt-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                  {{ t('management.agentRoles.draftQueue') }}
                </p>
                <p class="mt-1 text-xs text-subtle">
                  {{ t('management.agentRoles.draftCount', { count: briefs.length }) }}
                </p>
              </div>
              <TeaButton
                v-if="briefs.length"
                type="button"
                appearance="ghost"
                size="small"
                class="px-2 text-xs"
                @click="reviewing = !reviewing"
              >
                {{
                  reviewing
                    ? t('management.agentRoles.hideReview')
                    : t('management.agentRoles.reviewBatch')
                }}
              </TeaButton>
            </div>
            <div
              v-if="briefs.length"
              class="mt-3 divide-y divide-line-soft border-y border-line-soft"
            >
              <div
                v-for="(item, index) in briefs"
                :key="item.id"
                class="flex items-start gap-3 py-3"
              >
                <span class="font-mono text-xs text-subtle">{{
                  String(index + 1).padStart(2, '0')
                }}</span>
                <p class="min-w-0 flex-1 text-xs leading-5 text-dim">{{ item.text }}</p>
                <TeaIconButton
                  :label="t('management.agentRoles.removeBrief')"
                  icon="i-mdi-close"
                  size="small"
                  @click="removeBrief(item.id)"
                />
              </div>
            </div>
            <p
              v-else
              class="mt-3 rounded-control bg-canvas px-3 py-3 text-xs leading-5 text-subtle"
            >
              {{ t('management.agentRoles.queueEmpty') }}
            </p>
          </div>
        </section>
      </div>
    </div>

    <EditorDrawer
      :open="editorOpen"
      :title="
        editing ? t('management.agentRoles.editTitle') : t('management.agentRoles.createTitle')
      "
      @close="editorOpen = false"
    >
      <div
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
      />
    </EditorDrawer>
  </section>
</template>
