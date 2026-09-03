<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MessageReceiptDetails, Participant } from '../contracts'
import { TeaButton, TeaDialog, TeaTabs } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  details: MessageReceiptDetails | null
  loading: boolean
  errorCode: string | null
}>()

const emit = defineEmits<{ close: []; retry: [] }>()
const { t } = useI18n()
const activeTab = ref('read')
const tabs = computed(() => [
  {
    value: 'read',
    label: t('channels.receipts.readTab', { count: props.details?.readCount ?? 0 }),
  },
  {
    value: 'unread',
    label: t('channels.receipts.unreadTab', { count: props.details?.unreadCount ?? 0 }),
  },
])

watch(
  () => props.open,
  (open) => {
    if (open) activeTab.value = 'read'
  },
)

function initials(name: string): string {
  return [...name].slice(0, 2).join('').toUpperCase()
}

function list(kind: 'read' | 'unread'): Participant[] {
  return (kind === 'read' ? props.details?.read : props.details?.unread) ?? []
}
</script>

<template>
  <TeaDialog
    :open="open"
    :title="t('channels.receipts.title')"
    :close-label="t('common.close')"
    width="small"
    dismissable
    @close="emit('close')"
  >
    <div v-if="loading && !details" class="flex justify-center py-10">
      <span class="i-mdi-loading size-5 animate-spin text-subtle" aria-hidden="true" />
      <span class="sr-only">{{ t('channels.receipts.loading') }}</span>
    </div>
    <div v-else-if="errorCode && !details" class="py-8 text-center">
      <p class="text-sm text-danger">{{ t('channels.receipts.error', { code: errorCode }) }}</p>
      <TeaButton class="mt-3" size="small" @click="emit('retry')">
        {{ t('channels.connection.retry') }}
      </TeaButton>
    </div>
    <TeaTabs v-else v-model="activeTab" :tabs="tabs" :label="t('channels.receipts.tabsLabel')">
      <template #read>
        <div class="max-h-80 divide-y divide-line-soft overflow-y-auto border-y border-line-soft">
          <div
            v-for="person in list('read')"
            :key="person.id"
            class="flex min-w-0 items-center gap-3 px-2 py-2.5"
          >
            <img
              v-if="person.avatarUrl"
              class="size-8 shrink-0 rounded-full object-cover"
              :src="person.avatarUrl"
              alt=""
            />
            <span
              v-else
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-dim"
              aria-hidden="true"
            >
              {{ initials(person.name) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-fg">{{ person.name }}</span>
              <span class="block truncate text-xs text-subtle">{{ person.id }}</span>
            </span>
          </div>
          <p v-if="list('read').length === 0" class="px-3 py-8 text-center text-sm text-subtle">
            {{ t('channels.receipts.noRead') }}
          </p>
        </div>
      </template>
      <template #unread>
        <div class="max-h-80 divide-y divide-line-soft overflow-y-auto border-y border-line-soft">
          <div
            v-for="person in list('unread')"
            :key="person.id"
            class="flex min-w-0 items-center gap-3 px-2 py-2.5"
          >
            <img
              v-if="person.avatarUrl"
              class="size-8 shrink-0 rounded-full object-cover"
              :src="person.avatarUrl"
              alt=""
            />
            <span
              v-else
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-dim"
              aria-hidden="true"
            >
              {{ initials(person.name) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-fg">{{ person.name }}</span>
              <span class="block truncate text-xs text-subtle">{{ person.id }}</span>
            </span>
          </div>
          <p v-if="list('unread').length === 0" class="px-3 py-8 text-center text-sm text-subtle">
            {{ t('channels.receipts.noUnread') }}
          </p>
        </div>
      </template>
    </TeaTabs>
  </TeaDialog>
</template>
