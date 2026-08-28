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
  <section class="relative mt-3 w-full pl-5 pt-2 tea-fg" :aria-label="t('approval.title')">
    <span class="absolute inset-y-2 left-0 w-0.5 tea-bg-warning" aria-hidden="true" />

    <div class="flex items-start gap-3">
      <svg
        class="mt-0.5 h-4 w-4 shrink-0 tea-fg-muted"
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
          <h3 class="tea-text-body tea-weight-strong tea-fg">{{ t('approval.title') }}</h3>
        </div>
        <p class="mt-1 tea-text-caption leading-5 tea-fg-muted">{{ t('approval.description') }}</p>

        <div v-if="request.resources.length" class="mt-2.5 space-y-1">
          <p class="tea-text-micro tea-weight-medium uppercase tea-fg-subtle">
            {{ t('approval.resources') }}
          </p>
          <code
            v-for="resource in request.resources"
            :key="resource"
            class="block overflow-x-auto tea-bg-muted px-2 py-1.5 tea-text-caption leading-4 tea-fg-muted"
            >{{ resource }}</code
          >
        </div>

        <div
          v-if="request.capabilities.length"
          class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span class="tea-text-micro tea-weight-medium uppercase tea-fg-subtle">{{
            t('approval.capabilities')
          }}</span>
          <code
            v-for="capability in request.capabilities"
            :key="capability"
            class="tea-text-caption tea-fg-muted"
            >{{ capability }}</code
          >
        </div>

        <p
          v-if="request.status !== 'pending'"
          class="mt-2 tea-text-caption"
          :class="request.status === 'failed' ? 'tea-fg-danger' : 'tea-fg-muted'"
          aria-live="polite"
        >
          {{ request.error || t(`approval.status.${request.status}`) }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-1.5">
          <TeaButton
            v-if="request.decisions.includes('allowOnce')"
            type="button"
            class="h-8 tea-radius-small tea-bg-inverse px-3 tea-text-caption tea-weight-medium tea-fg-inverse transition-colors tea-hover-bg-inverse disabled:cursor-not-allowed tea-disabled-bg"
            :disabled="!canDecide"
            @click="emit('decide', 'allowOnce')"
          >
            {{ t('approval.allowOnce') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('allowSession')"
            type="button"
            class="h-8 tea-radius-small tea-bg-canvas px-3 tea-text-caption tea-weight-medium tea-fg transition-colors tea-hover-bg-strong disabled:cursor-not-allowed tea-disabled-fg"
            :disabled="!canDecide"
            @click="emit('decide', 'allowSession')"
          >
            {{ t('approval.allowSession') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('deny')"
            type="button"
            class="h-8 tea-radius-small px-2.5 tea-text-caption tea-fg-muted transition-colors tea-hover-bg-strong tea-hover-fg disabled:cursor-not-allowed tea-disabled-fg"
            :disabled="!canDecide"
            @click="emit('decide', 'deny')"
          >
            {{ t('approval.deny') }}
          </TeaButton>
          <TeaButton
            v-if="request.decisions.includes('cancel')"
            type="button"
            class="h-8 tea-radius-small px-2.5 tea-text-caption tea-fg-danger transition-colors tea-hover-bg-danger disabled:cursor-not-allowed tea-disabled-fg"
            :disabled="!canDecide"
            @click="emit('decide', 'cancel')"
          >
            {{ t('approval.cancel') }}
          </TeaButton>
          <span
            v-if="isResolving"
            class="ml-1 h-3 w-3 animate-spin tea-radius-pill border tea-border tea-border-inverse"
          />
        </div>
      </div>
    </div>
  </section>
</template>
