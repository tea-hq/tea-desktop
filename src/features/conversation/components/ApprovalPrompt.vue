<script setup lang="ts">
import { TeaButton } from '@/shared/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ApprovalDecision, ApprovalRequest } from '../contracts'

const props = defineProps<{
  request: ApprovalRequest
}>()

const emit = defineEmits<{
  decide: [decision: ApprovalDecision]
}>()

const { t } = useI18n()
const canDecide = computed(
  () => props.request.status === 'pending' || props.request.status === 'failed',
)
const isResolving = computed(() => props.request.status === 'resolving')
</script>

<template>
  <section class="relative mt-3 w-full pl-5 pt-2 text-fg" :aria-label="t('approval.title')">
    <span class="absolute inset-y-2 left-0 w-0.5 bg-warning" aria-hidden="true" />

    <div class="flex items-start gap-3">
      <span class="i-mdi-shield-alert-outline mt-0.5 size-4 shrink-0 text-dim" aria-hidden="true" />

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 class="text-base font-semibold text-fg">{{ t('approval.title') }}</h3>
        </div>
        <p class="mt-1 text-sm leading-5 text-dim">{{ t('approval.description') }}</p>

        <div v-if="request.resources.length" class="mt-2.5 space-y-1">
          <p class="text-xs font-medium uppercase text-subtle">
            {{ t('approval.resources') }}
          </p>
          <code
            v-for="resource in request.resources"
            :key="resource"
            class="block w-fit max-w-full overflow-x-auto rounded-control bg-panel px-3 py-1.5 text-sm leading-4 text-dim"
            >{{ resource }}</code
          >
        </div>

        <div
          v-if="request.capabilities.length"
          class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span class="text-xs font-medium uppercase text-subtle">{{
            t('approval.capabilities')
          }}</span>
          <code
            v-for="capability in request.capabilities"
            :key="capability"
            class="text-sm text-dim"
            >{{ capability }}</code
          >
        </div>

        <p
          v-if="request.status !== 'pending'"
          class="mt-2 text-sm"
          :class="request.status === 'failed' ? 'text-danger' : 'text-dim'"
          aria-live="polite"
        >
          {{ request.error || t(`approval.status.${request.status}`) }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-1.5">
          <TeaButton
            v-if="request.decisions.includes('allowOnce')"
            type="button"
            appearance="primary"
            size="small"
            :disabled="!canDecide"
            @click="emit('decide', 'allowOnce')"
          >
            {{ t('approval.allowOnce') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('allowSession')"
            type="button"
            appearance="secondary"
            size="small"
            :disabled="!canDecide"
            @click="emit('decide', 'allowSession')"
          >
            {{ t('approval.allowSession') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('deny')"
            type="button"
            appearance="ghost"
            size="small"
            :disabled="!canDecide"
            @click="emit('decide', 'deny')"
          >
            {{ t('approval.deny') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('cancel')"
            type="button"
            appearance="ghost"
            size="small"
            class="text-danger hover:bg-danger-subtle hover:text-danger"
            :disabled="!canDecide"
            @click="emit('decide', 'cancel')"
          >
            {{ t('approval.cancel') }}
          </TeaButton>
          <span
            v-if="isResolving"
            class="ml-1 h-3 w-3 animate-spin rounded-full border border-line border-inverse"
          />
        </div>
      </div>
    </div>
  </section>
</template>
