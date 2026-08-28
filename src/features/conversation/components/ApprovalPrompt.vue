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
      <svg
        class="mt-0.5 h-4 w-4 shrink-0 text-dim"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          d="M10 2.8 16 5v4.6c0 3.5-2.4 6.2-6 7.6-3.6-1.4-6-4.1-6-7.6V5l6-2.2Z"
          stroke-width="1.4"
        />
        <path d="M10 6.5v4.2m0 2.6v.1" stroke-width="1.5" stroke-linecap="round" />
      </svg>

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
            class="block overflow-x-auto bg-panel px-2 py-1.5 text-sm leading-4 text-dim"
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
            class="h-8 rounded-structural bg-inverse px-3 text-sm font-medium text-canvas transition-colors hover:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-muted"
            :disabled="!canDecide"
            @click="emit('decide', 'allowOnce')"
          >
            {{ t('approval.allowOnce') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('allowSession')"
            type="button"
            class="h-8 rounded-structural bg-canvas px-3 text-sm font-medium text-fg transition-colors hover:bg-pressed disabled:cursor-not-allowed disabled:text-subtle"
            :disabled="!canDecide"
            @click="emit('decide', 'allowSession')"
          >
            {{ t('approval.allowSession') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('deny')"
            type="button"
            class="h-8 rounded-structural px-2.5 text-sm text-dim transition-colors hover:bg-pressed hover:text-fg disabled:cursor-not-allowed disabled:text-subtle"
            :disabled="!canDecide"
            @click="emit('decide', 'deny')"
          >
            {{ t('approval.deny') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('cancel')"
            type="button"
            class="h-8 rounded-structural px-2.5 text-sm text-danger transition-colors hover:bg-danger-subtle disabled:cursor-not-allowed disabled:text-subtle"
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
