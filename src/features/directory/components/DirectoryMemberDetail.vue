<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { TeaButton, TeaEmptyState, TeaMessageBar } from '@/shared/ui'
import type { DirectoryUser } from '../contracts'
import { directoryUserInitials, isDirectoryMessagingReady } from '../directoryPresentation'

const props = defineProps<{
  user: DirectoryUser | null
  actionError?: string | null
}>()

const emit = defineEmits<{
  message: [user: DirectoryUser]
}>()

const { t } = useI18n()

const messagingReady = computed(() => Boolean(props.user && isDirectoryMessagingReady(props.user)))
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-canvas" data-testid="directory-detail">
    <header class="shrink-0 border-b border-line-soft px-6 py-5">
      <h2 class="text-base font-semibold text-fg">{{ t('directory.memberDetails') }}</h2>
    </header>

    <TeaEmptyState
      v-if="!user"
      class="flex-1"
      :title="t('directory.noMemberSelected')"
      icon="i-mdi-account-outline"
    />

    <template v-else>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="flex flex-col items-center px-6 pb-7 pt-8 text-center">
          <span
            class="flex size-16 items-center justify-center overflow-hidden rounded-full bg-inverse text-lg font-semibold text-on-inverse"
            aria-hidden="true"
          >
            <img
              v-if="user.oidc.avatarUrl"
              :src="user.oidc.avatarUrl"
              alt=""
              class="size-full object-cover"
              referrerpolicy="no-referrer"
            />
            <span v-else>{{ directoryUserInitials(user.center.displayName) }}</span>
          </span>
          <h3 class="mt-4 max-w-full truncate text-xl font-semibold text-fg">
            {{ user.center.displayName }}
          </h3>
          <p class="mt-1 max-w-full truncate text-sm text-subtle">
            {{ user.oidc.preferredUsername || user.center.userId }}
          </p>
          <span class="mt-4 inline-flex items-center gap-2 text-xs font-medium text-dim">
            <span
              class="size-1.5 rounded-full"
              :class="messagingReady ? 'bg-success' : 'bg-disabled'"
              aria-hidden="true"
            />
            {{
              messagingReady ? t('directory.messagingReady') : t('directory.messagingUnavailable')
            }}
          </span>
        </div>

        <dl class="border-t border-line-soft px-6">
          <div class="border-b border-line-soft py-4">
            <dt class="text-xs font-medium text-subtle">{{ t('directory.email') }}</dt>
            <dd class="mt-1 break-words text-sm text-fg">
              {{ user.oidc.email || t('directory.notProvided') }}
            </dd>
          </div>
          <div class="border-b border-line-soft py-4">
            <dt class="text-xs font-medium text-subtle">{{ t('directory.account') }}</dt>
            <dd class="mt-1 break-words font-mono text-sm text-fg">
              {{ user.im?.account || t('directory.accountUnavailable') }}
            </dd>
          </div>
          <div class="border-b border-line-soft py-4">
            <dt class="text-xs font-medium text-subtle">{{ t('directory.provider') }}</dt>
            <dd class="mt-1 break-words text-sm text-fg">
              {{ user.im?.provider || t('directory.notProvided') }}
            </dd>
          </div>
        </dl>

        <div v-if="actionError" class="px-6 pt-5">
          <TeaMessageBar tone="error">{{ t(actionError) }}</TeaMessageBar>
        </div>
      </div>

      <footer class="shrink-0 border-t border-line bg-canvas p-5">
        <TeaButton
          appearance="primary"
          fluid
          :disabled="!messagingReady"
          data-testid="directory-message"
          @click="emit('message', user)"
        >
          <span class="i-mdi-message-text-outline size-4" aria-hidden="true" />
          {{ t('directory.sendMessage') }}
        </TeaButton>
      </footer>
    </template>
  </section>
</template>
